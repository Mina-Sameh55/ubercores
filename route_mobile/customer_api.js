/* jshint esversion: 6 */
/* jshint esversion: 8 */
/* jshint node: true */



const express = require("express");
const router = express.Router();
const multer  = require('multer');
const mysql = require("mysql2");
const bcrypt = require('bcrypt');
const axios = require('axios');
const geolib = require('geolib');
const AllFunction = require("../route_function/function");
const sendOneNotification = require("../middleware/send");
const { DataFind, DataInsert, DataUpdate, DataDelete } = require("../middleware/databse_query");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "./public/uploads/payment_proof");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + file.originalname);

    }
});

const upload = multer({storage : storage});

const storage1 = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "./public/uploads/customer_profile");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + file.originalname);

    }
});

const customer_profile = multer({storage : storage1});



// ============= Map Data ================ // 

router.get("/web_map_data", async(req, res)=>{
    try {
        const { text } = req.query;
        if(!text) return res.status(200).json({});

        const gs = await DataFind(`SELECT google_map_key FROM tbl_general_settings`);

        await axios.get(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${text}&key=${gs[0].google_map_key}`)
        .then(response => {
            return res.status(200).json(response.data);
        })
        .catch(error => {
            console.log(error);
            return res.status(200).json({});
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============= Signup ================ //

router.post("/signup", async(req, res)=>{
    try {
        const {name, email, ccode, phone, password, referral_code} = req.body;
        const missingField = ["name", "email", "ccode", "phone", 'password'].find(field => !req.body[field]);
        if(missingField) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong' })
        const cus_data = await DataFind(`SELECT * FROM tbl_customer WHERE country_code = '${ccode}' AND phone = '${phone}'`);
        const general = await DataFind(`SELECT refer_credit, one_app_id, one_api_key FROM tbl_general_settings`);
        let generald = { one_app_id: general[0].one_app_id, one_api_key: general[0].one_api_key }
        if (cus_data != "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'PhoneNo Already Exists!', general:generald })
        let esname = mysql.escape(name);
        const hash = await bcrypt.hash(password, 10);
        let otp_result = await AllFunction.otpGenerate(6);
        // Refer Cradit
        if (referral_code != "") {
            const referal_customer = await DataFind(`SELECT id, wallet FROM tbl_customer WHERE referral_code = '${referral_code}'`);
            if (referal_customer != "") {
                let amount = parseFloat(referal_customer[0].wallet) + parseFloat(general[0].refer_credit);
                if (await DataUpdate(`tbl_customer`, `wallet = '${amount}'`, `id = '${referal_customer[0].id}'`, req.hostname, req.protocol) == -1) {
                    return res.status(200).json({ message: process.env.dataerror, status:false });
                }
                let fulldate = await AllFunction.TodatDate();
                if (await DataInsert(`tbl_transaction_customer`, `c_id, payment_id, amount, date, status, type`,
                    `${referal_customer[0].id}, '0', '${general[0].refer_credit}', '${fulldate.date}T${fulldate.time}', '1', ''`, req.hostname, req.protocol) == -1) {
                    return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
                }
            }
        }
        const date = new Date().toISOString().split('T');
        if (await DataInsert(`tbl_customer`, `profile_image, name, email, country_code, phone, password, status, referral_code, wallet, date`,
            `'', ${esname}, '${email}', '${ccode}', '${phone}', '${hash}', '1', '${otp_result}', '0', '${date}'`, req.hostname, req.protocol) == -1) {
            return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
        }
        const new_cus_data = await DataFind(`SELECT * FROM tbl_customer WHERE country_code = '${ccode}' AND phone = '${phone}'`);
        return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Signup successful', general:generald, customer_data:new_cus_data[0]});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============= Edit Customer Data ================ //

router.post("/edit_customer", customer_profile.single("profile_img"), async (req, res) => {
    try {
        // 🛑 Prevent DB write if disabled
        if (process.env.DISABLE_DB_WRITE === 'true') {
            return res.status(403).json({
                ResponseCode: 403,
                Result: false,
                message: "For demo purpose we disabled crud operations!!"
            });
        }

        const { id, name, email, password } = req.body;

        const missingField = ["id", "name", "email"].find(field => !req.body[field]);
        if (missingField) {
            return res.status(200).json({ ResponseCode: 401, Result: false, message: 'Something went wrong' });
        }

        let esname = mysql.escape(name), pass, imageUrl = "";
        const passw = await DataFind(`SELECT profile_image, password FROM tbl_customer WHERE id = '${id}'`);
        if (!password) pass = passw[0].password;
        else pass = await bcrypt.hash(password, 10);

        imageUrl = req.file ? "uploads/customer_profile/" + req.file.filename : passw[0].profile_image;

        if (await DataUpdate(
            `tbl_customer`,
            `profile_image = '${imageUrl}', name = ${esname}, email = '${email}', password = '${pass}'`,
            `id = '${id}'`,
            req.hostname,
            req.protocol
        ) == -1) {
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }

        const customer_data = await DataFind(`SELECT * FROM tbl_customer WHERE id = '${id}'`);

        return res.status(200).json({
            ResponseCode: 200,
            Result: true,
            message: 'Profile Update Successful',
            customer_data: customer_data[0]
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// ============= Login ================ //

router.post("/login", async(req, res)=>{
    try {
        const {ccode, phone, password} = req.body;

        const missingField = ["ccode", "phone", 'password'].find(field => !req.body[field]);
        if(missingField) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong' })

        const general = await DataFind(`SELECT one_app_id, one_api_key FROM tbl_general_settings`);
        const cus_data = await DataFind(`SELECT * FROM tbl_customer WHERE country_code = '${ccode}' AND phone = '${phone}'`);
        
        if (cus_data == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: "PhoneNo Not Exists!", general:general[0] });

        if (cus_data[0].status != "1") return res.status(200).json({ ResponseCode: 401, Result:false, message: "Account Deactivated", general:general[0] });
    
        const hash_pass = await bcrypt.compare(password, cus_data[0].password);

        if (!hash_pass) {
            return res.status(200).json({ ResponseCode: 401, Result:false, message: "Password Not match", general:general[0] });
        } else {
            return res.status(200).json({ ResponseCode: 200, Result:true, message: "Login Sccessful", general:general[0], customer_data:cus_data[0] });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// ============= Detail Check ================ //

router.post("/mobile_check", async(req, res)=>{
    try {
        const {ccode, phone} = req.body;
        
        if(ccode == "" || phone == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong' });

        const cus_data = await DataFind(`SELECT * FROM tbl_customer WHERE country_code = '${ccode}' AND phone = '${phone}'`);
        
        if (cus_data == "") return res.status(200).json({ ResponseCode: 200, Result:true, message: "New Number" });
        else return res.status(200).json({ ResponseCode: 401, Result:false, message: "PhoneNo Already Exist" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// ============= Forgot Password ================ //

router.post("/forgot_password", async(req, res)=>{
    try {
        if (process.env.DISABLE_DB_WRITE === 'true') {
            return res.status(403).json({
                ResponseCode: 403,
                Result: false,
                message: "For demo purpose we disabled crud operations!!"
            });
        }
        const {ccode, phone, password} = req.body;

        if (ccode == "" || phone == "" || password == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong!'});

        const cus_data = await DataFind(`SELECT * FROM tbl_customer WHERE country_code = '${ccode}' AND phone = '${phone}'`);

        if (cus_data == "") {
            res.status(200).json({ ResponseCode: 401, Result:false, message: "PhoneNo Not Exist" });
        } else {
            const hash = await bcrypt.hash(password, 10);

            if (await DataUpdate(`tbl_customer`, `password = '${hash}'`, `id = '${cus_data[0].id}'`, req.hostname, req.protocol) == -1) {
        
                return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
            }
            res.status(200).json({ ResponseCode: 200, Result:true, message: 'Password Change successful' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// ============= OTP Details ================ //

router.get("/otp_detail", async(req, res)=>{
    try {
        const general_setting = await DataFind(`SELECT * FROM tbl_general_settings`);

        let sms_type = ""
        if (general_setting[0].sms_type == "1") {
            sms_type = "MSG91"
        } else if (general_setting[0].sms_type == "2") {
            sms_type = "Twilio"
        } else {
            sms_type = "No Auth"
        }

        if (sms_type != "") res.status(200).json({ ResponseCode: 200, Result:true, message: sms_type });
        else res.status(200).json({ ResponseCode: 401, Result:false, message: 'Data Not Found' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// ============= MSG91 OTP ================ //

router.post("/msg91", async(req, res)=>{
    try {
        const {phoneno} = req.body;

        if (phoneno == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong!'});

        const general_setting = await DataFind(`SELECT * FROM tbl_general_settings`);

        let otp_result = await AllFunction.otpGenerate(6)

        let auth_key = general_setting[0].msg_key;
        let template_id = general_setting[0].msg_token;
        
        let pho_no = phoneno;
        const options = {
            method: 'POST',
            url: 'https://control.msg91.com/api/v5/otp?template_id='+ template_id +'&mobile='+ pho_no +'&otp=' + otp_result,
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                authkey: auth_key
            },
            data: {Param1: 'value1'}
        };
    
        axios.request(options)
        .then(function (response) {
            console.log(response.data);
            res.status(200).json({ ResponseCode: 200, Result:true, message: "Otp Send successful", otp: otp_result });
        })
        .catch(function (error) {
            console.error(error);
            res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong' });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// ============= Twilio OTP ================ //

router.post("/twilio", async(req, res)=>{
    try {
        const {phoneno} = req.body;

        if (phoneno == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong!'});

        const general_setting = await DataFind(`SELECT * FROM tbl_general_settings`);

        let otp_result = await AllFunction.otpGenerate(6)

        // sid :- ACc78a11402fee7c54a90596e15c12403f
        // token :- 1a9c251fd0a54fde091979cb01aa6686
        // number :- +17869985673

        let accountSid = general_setting[0].twilio_sid;
        let authToken = general_setting[0].twilio_token;
    
        const client = require('twilio')(accountSid, authToken);
    
        client.messages.create({
            body: 'Your '+ general_setting[0].title +' otp is '+ otp_result +'',
            from: general_setting[0].twilio_phoneno,
            to: phoneno
        })
        .then(message => {
            console.log(message.sid);
            res.status(200).json({ ResponseCode: 200, Result:true, message: "Otp Send successful", otp: otp_result });
        })
        .catch((error) => {
            console.log(error);
            res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong' });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// ============= Home ================ //

router.post("/home", async(req, res)=>{
    try {
        const {uid, lat, lon} = req.body;
        
        if ( uid == "" || lat == "" || lon == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong' });
        
        const general = await DataFind(`SELECT site_currency, offer_expire_time, google_map_key FROM tbl_general_settings`);
        if(general == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});

        let vehicle_list = await DataFind(`SELECT id, image, name, description, bidding FROM tbl_vehicle WHERE status = '1' AND home_visible_status = '1'`);
        vehicle_list.map(vvel => { vvel.role = "1"});
        
        const ms = await DataFind(`SELECT id, outstation, rental, package FROM tbl_general_settings`);

       

        const midsArr = [];
        if (ms[0].outstation == 1) midsArr.push("1");
        if (ms[0].rental == 1) midsArr.push("2");
        if (ms[0].package == 1) midsArr.push("3");
        
        let module_setting = [], package_list = [];
        if (midsArr.length > 0) {
            module_setting = await DataFind(`SELECT * FROM tbl_module_setting WHERE id IN (${midsArr})`);
            module_setting.map(ovel => {
                ovel.bidding = (parseFloat(ovel.id) + parseFloat(1)).toString();
                ovel.role = (parseFloat(ovel.id) + parseFloat(1)).toString();
            });
        }

       

        const category_list = [...vehicle_list, ...module_setting, ];
        // const category_list = [...vehicle_list];

        let dr = await AllFunction.CustomerReview("cus");
        const cus_rating = await DataFind(`SELECT cus.id ${dr.tot_review} ${dr.avgstar}
                                        FROM tbl_customer AS cus
                                        ${dr.outtable}
                                        WHERE cus.id = '${uid}' GROUP BY cus.id ORDER BY id DESC`);

        let rdata = await DataFind(`SELECT veh.*, COALESCE(vec.minimum_fare, '') as minimum_fare, COALESCE(vec.maximum_fare, '') as maximum_fare
                                    FROM tbl_request_vehicle AS veh
                                    JOIN tbl_vehicle AS vec ON veh.vehicleid = vec.id
                                    WHERE c_id = '${uid}' ORDER BY id DESC LIMIT 1`);
        
        if (rdata != '') {
            let rd = await AllFunction.VehicleAllRide(rdata[0], 2);
             
            let pickapp = {title: rd.piclatlon.title, subtitle: rd.piclatlon.subtitle}, picklat = {latitude: rd.piclatlon.latitude, longitude: rd.piclatlon.longitude};
            let drop_add = {title: '', subtitle: ''}, drop_latlon = {latitude: '', longitude: ''}, daddlist = [], dlatlist = [];
            for (let i = 0; i < rd.dropdata.length;) {
                if (i == 0) {
                    drop_add = {title: rd.dropdata[i].title, subtitle: rd.dropdata[i].subtitle};
                    drop_latlon = {latitude: rd.dropdata[i].latitude, longitude: rd.dropdata[i].longitude};
                } else {
                    daddlist.push({title: rd.dropdata[i].title, subtitle: rd.dropdata[i].subtitle});
                    dlatlist.push({latitude: rd.dropdata[i].latitude, longitude: rd.dropdata[i].longitude});
                }
                i++;
            }
            
            if (typeof rdata[0].d_id == "string") rdata[0].d_id = JSON.parse(rdata[0].d_id);
            let runtime = await AllFunction.CurrentDatetoOldDateS(rdata[0].start_time, general[0].offer_expire_time);

            rdata[0].pick_add = pickapp; rdata[0].pick_latlon = picklat; rdata[0].drop_add = drop_add; rdata[0].drop_latlon = drop_latlon; rdata[0].drop_add_list = daddlist; rdata[0].drop_latlon_list = dlatlist;
            rdata[0].bidding_run_status = rdata[0].bidding_d_price != '' ? 1 : 0; rdata[0].increased_time = runtime > 0 ? runtime : 0;
            rdata[0].price = Number(rdata[0].price); rdata[0].tot_km = Number(rdata[0].tot_km);

            delete rdata[0].pic_lat_long; delete rdata[0].drop_lat_long; delete rdata[0].pic_address; delete rdata[0].drop_address; delete rdata[0].status_time_location;
            delete rdata[0].bidding_d_price;
        }
        
        delete general[0].offer_expire_time
        return res.status(200).json({ ResponseCode: 200, Result:true, message: "Data Load successful", general:general[0], 
            cus_rating: cus_rating != '' ? cus_rating[0] : {id:0, tot_review:0, avg_star:0}, category_list, runnig_ride: rdata });
            
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// ============= Vehicle Full Information ================ //

router.post("/vehicle_information", async(req, res)=>{
    try {
        const {vehicle_id} = req.body;
        
        if ( vehicle_id == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong' });

        const vehicle_list = await DataFind(`SELECT id, image, name, description, passenger_capacity FROM tbl_vehicle WHERE id = '${vehicle_id}' AND status = '1'`);

        if (vehicle_list != "") return res.status(200).json({ ResponseCode: 200, Result:true, message: "Data Load successful", vehicle: vehicle_list[0] });
        else return res.status(200).json({ ResponseCode: 401, Result:false, message: "Vehicle Not Found!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// ============= Home Wallet ================ //

router.post("/home_wallet", async(req, res)=>{
    try {
        const {uid} = req.body;
        if ( uid == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong' });

        const driver = await DataFind(`SELECT wallet FROM tbl_customer WHERE id = '${uid}'`);
        if(driver == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Driver Not Found!'});

        let walletp = "0";
        if (typeof parseFloat(driver[0].wallet) == "Number" || driver[0].wallet) {
            walletp = driver[0].wallet
        } else walletp = "0"

        return res.status(200).json({ ResponseCode: 200, Result:true, message: "Data Load successful", wallet_amount:driver[0].wallet });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

router.post("/home_mape", async(req, res)=>{
    try {
        const {mid, lat, lon} = req.body;
        
        if ( !lat || !lon) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong' });

        const general = await DataFind(`SELECT site_currency, vehicle_radius FROM tbl_general_settings`);

        let convertzone = [{ latitude: Number(lat), longitude: Number(lon) }];
        // let dzone = await AllFunction.ZoneData();
        let zonecheck = await AllFunction.CheckZone(convertzone);
        
        if (zonecheck[1].zc != "0") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Location is not in the zone!'});

        let v_id;
        if (mid == "") {
            let vehicle_list = await DataFind(`SELECT id, image, name, description, bidding FROM tbl_vehicle WHERE status = '1' AND home_visible_status = '1'`);
            v_id = vehicle_list[0].id;
        } else v_id = mid;
        
        console.log(zonecheck[2].zid);
        
        const driver = await DataFind(`SELECT dr.id, COALESCE(ve.map_img, '') AS image, COALESCE(ve.name, '') AS name, COALESCE(ve.description, '') AS description, 
                                        COALESCE(dr.latitude, '') AS latitude, COALESCE(dr.longitude, '') AS longitude 
                                        FROM tbl_driver AS dr
                                        JOIN tbl_vehicle AS ve ON dr.vehicle = ve.id AND ve.id = '${v_id}'
                                        WHERE 
                                        (6371 * ACOS(
                                            COS(RADIANS(dr.latitude)) * COS(RADIANS(${Number(lat)})) *
                                            COS(RADIANS(${Number(lon)}) - RADIANS(dr.longitude)) +
                                            SIN(RADIANS(dr.latitude)) * SIN(RADIANS(${Number(lat)}))
                                        )) <= ${Number(general[0].vehicle_radius)}
                                        AND JSON_CONTAINS(dr.zone, '${JSON.stringify(zonecheck[2].zid[0])}', '$') AND dr.fstatus = '1' AND dr.status = '1' AND dr.approval_status = '1' AND dr.latitude NOT IN ('') AND dr.longitude NOT IN ('')`);
        
        // Old
        // const driver = await DataFind(`SELECT dr.id, COALESCE(ve.map_img, '') AS image, COALESCE(ve.name, '') AS name, COALESCE(ve.description, '') AS description, 
        //                                 COALESCE(dr.latitude, '') AS latitude, COALESCE(dr.longitude, '') AS longitude 
        //                                 FROM tbl_driver AS dr
        //                                 JOIN tbl_vehicle AS ve ON dr.vehicle = ve.id AND ve.id = '${v_id}'
        //                                 WHERE dr.zone IN (${zonecheck[2].zid}) AND dr.fstatus = '1' AND dr.status = '1' AND dr.approval_status = '1' AND dr.latitude NOT IN ('') AND dr.longitude NOT IN ('')`);



        // const driver = await DataFind(`
        //     SELECT dr.id, COALESCE(ve.image, '') AS image, COALESCE(ve.name, '') AS name, COALESCE(ve.description, '') AS description, COALESCE(dr.latitude, '') AS latitude, 
        //         COALESCE(dr.longitude, '') AS longitude,
        //         (6371 * acos(cos(radians(${lat})) * cos(radians(dr.latitude)) * cos(radians(dr.longitude) - radians(${lon})) + sin(radians(${lat})) * sin(radians(dr.latitude)))) AS distance 
        //     FROM tbl_driver AS dr 
        //     JOIN tbl_vehicle AS ve ON dr.vehicle = ve.id
        //     WHERE dr.fstatus = '1' AND dr.status = '1' AND dr.approval_status = '1' AND dr.zone IN (${zonecheck[2].zid}) AND dr.latitude IS NOT NULL AND dr.longitude IS NOT NULL 
        //         AND dr.latitude <> '' AND dr.longitude <> '' 
        //     HAVING distance <= ${general[0].radius}
        //     ORDER BY distance ASC
        // `);

        // const driver = await DataFind(`
        //     SELECT *, 
        //         (6371 * acos(cos(radians(${lat})) * cos(radians(latitude)) * cos(radians(longitude) - radians(${lon})) + sin(radians(${lat})) * sin(radians(latitude)))) AS distance 
        //     FROM tbl_driver AS dr 
        //     JOIN tbl_vehicle AS ve ON dr.vehicle = ve.id
        //     WHERE fstatus = '1' 
        //         AND status = '1' AND approval_status = '1' AND zone IN (${zonecheck[2].zid}) AND latitude IS NOT NULL AND longitude IS NOT NULL 
        //     HAVING distance <= ${general[0].radius}
        //     ORDER BY distance ASC
        // `);
        
        // const driver = await DataFind(`SELECT dr.id, COALESCE(ve.image, '') AS image, COALESCE(ve.name, '') AS name, COALESCE(ve.description, '') AS description, 
        //                                 COALESCE(dr.latitude, '') AS latitude, COALESCE(dr.longitude, '') AS longitude 
        //                                 FROM tbl_driver AS dr
        //                                 JOIN tbl_vehicle AS ve ON dr.vehicle = ve.id
        //                                 WHERE dr.vehicle = '${mid}' AND dr.zone IN (${zonecheck[2].zid}) AND dr.fstatus = '1' AND dr.status = '1' AND dr.approval_status = '1' 
        //                                 AND dr.latitude NOT IN ('') AND dr.longitude NOT IN ('')`);

        if (driver == "") return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Driver not found!', driverid: [], list: []});

        let list = [], point = { latitude: Number(lat), longitude: Number(lon) }, driverid = [];
        for (let i = 0; i < driver.length;) {
            driverid.push(driver[i].id);
            list.push(driver[i]);

            // let dlotlon = { latitude: Number(driver[i].latitude), longitude: Number(driver[i].longitude) };
            // let distance = await AllFunction.RadiusCheck(point, dlotlon, Number(parseFloat(general[0].vehicle_radius) * parseFloat(1000)));
            
            // if (distance == 1) {
            //     driverid.push(driver[i].id);
            //     list.push(driver[i]);
            // }
            i++;
        }

        return res.status(200).json({ ResponseCode: 200, Result:true, message: "Data Load successful", zone_id: zonecheck[2].zid[0], driverid, list });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})





// ============= Home Location Calculate ================ //

router.post("/calculate", async(req, res)=>{
    try {
        const {uid, mid, mrole, pickup_lat_lon, drop_lat_lon, drop_lat_lon_list} = req.body;

        const missingField = ["uid", 'mid', 'mrole', 'pickup_lat_lon', 'drop_lat_lon'].find(field => !req.body[field]);
        if(missingField) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});

        console.log("calculate");

        if (mrole == "1") {
            let vehicle = await DataFind(`SELECT * FROM tbl_vehicle WHERE status = '1' AND id = '${mid}'`);
            if(vehicle == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Vehicle Not Found!'});

            let convertzone = await AllFunction.ZoneLatlon(pickup_lat_lon, drop_lat_lon, drop_lat_lon_list);
            // console.log(convertzone);
            
            // let dzone = await AllFunction.ZoneData();
            // let zonecheck = await AllFunction.CheckZone(convertzone, dzone.all_zone, dzone.zone_data);
            let zonecheck = await AllFunction.CheckZone(convertzone);
            
            const general = await DataFind(`SELECT * FROM tbl_general_settings`);
            if(general == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});
            
            if (zonecheck[1].zc != 0) return res.status(200).json({ ResponseCode: 401, Result: false, message: 'Address is not in the zone!'});
            let zoneresult = zonecheck[0].zr;
            // if (zonecheck[1].zc != 0) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Address is not in the zone!', offer_expire_time: general[0].offer_expire_time, 
            //     zoneresult:zonecheck[0].zr, tot_km:0, drop_price:0, tot_hour: 0, tot_minute: 0, tot_second: 0, driver_id: [], vehicle:[]});
            // let zoneresult = zonecheck[0].zr;

            let cal = 0, hour = 0, time = 0, totmin = 0;
            for (let c = 1; c < zoneresult.length;) {

                if (zoneresult[c].status == "1") {
                    
                    let pickup = `${convertzone[c-1].latitude},${convertzone[c-1].longitude}`;
                    let drop = `${convertzone[c].latitude},${convertzone[c].longitude}`;
                    let distance = await AllFunction.GetDistance(pickup, drop, general[0].google_map_key);

                    // let distancec = geolib.getDistance(convertzone[0], convertzone[c]);
                    // let kmdata = (distancec / 1000).toFixed(2);
                    cal += parseFloat(distance.dis);

                    // Time
                    let spltime = distance.dur.split(" ");
                    if (spltime.length == "2") {
                        totmin += parseFloat(spltime[0]);
                    } else if (spltime.length == "4") {
                        totmin += parseFloat(spltime[0]) * 60 + parseFloat(spltime[2]);
                    }

                }
                c++;
            }
             
            if (cal == "0") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});

            let roundkm = cal, add_distance = 0, tot_price = 0, km_charge = 0, extra_charge = 0, weather_charge = 0, extra_person_charge = 0, site_commission = 0;

            // let roundkm = cal, drop_price, add_distance;
            if (roundkm <= vehicle[0].min_km_distance) {
                km_charge = parseFloat(roundkm) * parseFloat(vehicle[0].min_km_price);

            } else {
                add_distance = parseFloat(roundkm) - parseFloat(Number(vehicle[0].min_km_distance));
                km_charge = (parseFloat(vehicle[0].min_km_distance) * parseFloat(vehicle[0].min_km_price) + (parseFloat(add_distance) * parseFloat(vehicle[0].after_km_price)));
            }
            tot_price += km_charge;

            if (Number(vehicle[0].extra_charge) > 0) {
                tot_price = tot_price + Number(vehicle[0].extra_charge);
                extra_charge = Number(vehicle[0].extra_charge);
            }

            if (general[0].weather_type == 'fix') {
                tot_price = tot_price + Number(general[0].weather_price);
                weather_charge = Number(general[0].weather_price);
            } else {
                const weatherp = Number(((tot_price / 100) * Number(general[0].weather_price)).toFixed(2));
                tot_price = tot_price + weatherp; weather_charge = weatherp
            }

            if (vehicle[0].comission_type == 'fix') {
                tot_price = tot_price + Number(vehicle[0].comission_rate);
                site_commission = Number(vehicle[0].comission_rate);
            } else {
                const scom = Number(((tot_price / 100) * Number(vehicle[0].comission_rate)).toFixed(2));
                tot_price = tot_price + scom; site_commission = scom;
            }

            let hou_min = await AllFunction.MinuteToHour(totmin), dr_price = Number((tot_price).toFixed(2));

            if (vehicle[0].bidding == 0) {
                return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Address calculate successful', offer_expire_time: general[0].offer_expire_time, zoneresult, 
                zone: zonecheck[2].zid, tot_km:Number(parseFloat(roundkm).toFixed(2)), tot_hour: hou_min.hour, tot_minute: hou_min.minute, tot_second: 0, 
                drop_price:dr_price, km_charge, extra_charge, weather_charge, extra_person_charge, site_commission, vehicle:vehicle[0] });

            } else {

                if (Number(vehicle[0].minimum_fare) > Number(tot_price)) {
    
                    return res.status(200).json({ ResponseCode: 401, Result: false, message: `The fare in this city exceeds our minimum limit of ${general[0].site_currency}${vehicle[0].minimum_fare}.` });
    
                } else if (Number(vehicle[0].maximum_fare) < Number(tot_price)) {
    
                    return res.status(200).json({ ResponseCode: 401, Result: false, message: `The fare in this city exceeds our maximum limit of ${general[0].site_currency}${vehicle[0].maximum_fare}.` });
    
                } else {
                    // if (vehicle[0].bidding == "1") {
                    //     driver_id = await address_calculate(0, 0, pickup_lat_lon, drop_lat_lon, drop_lat_lon_list, 2, convertzone, zonecheck, vehicle[0].id);
                    //     if (driver_id.status == false) return res.status(200).json({ ResponseCode: 200, Result:true, message: driver_id.message, offer_expire_time: general[0].out_offer_exprie_time_cus, 
                    //     zoneresult, tot_km:0, tot_price:0, tot_hour: 0, tot_minute: 0});
                    // }
    
                    return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Address calculate successful', offer_expire_time: general[0].offer_expire_time, zoneresult, 
                    zone: zonecheck[2].zid, tot_km:Number(parseFloat(roundkm).toFixed(2)), tot_hour: hou_min.hour, tot_minute: hou_min.minute, tot_second: 0, 
                    drop_price:dr_price, km_charge, extra_charge, weather_charge, extra_person_charge, site_commission, vehicle:vehicle[0] });
                }
            }

            // if (Number(vehicle[0].minimum_fare) >= Number(tot_price)) {

            //     return res.status(200).json({ ResponseCode: 401, Result:false, message: `The fare in this city exceeds our maximum limit of ${general[0].site_currency}${vehicle[0].minimum_fare}.`});

            // } else if (Number(vehicle[0].maximum_fare) <= Number(tot_price)) {

            //     return res.status(200).json({ ResponseCode: 401, Result:false, message: `The fare in this city exceeds our minimum limit of ${general[0].site_currency}${vehicle[0].maximum_fare}.`});
            // } else {
            //     // console.log("vehicle[0].bidding");
            //     // console.log(vehicle[0].bidding);
            //     // console.log("vehicle[0].bidding");
                
            //     return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Address calculate successful', offer_expire_time: general[0].offer_expire_time, zoneresult, 
            //     zone: zonecheck[2].zid, tot_km:Number(parseFloat(roundkm).toFixed(2)), tot_hour: hou_min.hour, tot_minute: hou_min.minute, tot_second: 0, 
            //     drop_price:dr_price, extra_charge, weather_charge, extra_person_charge, site_commission, vehicle:vehicle[0] });
            // }

            
        }

        // if (mrole == "2" || mrole == "3") {
        //     let module_setting = await DataFind(`SELECT * FROM tbl_module_setting`);
        // }

        // if (mrole == "4") {
        //     let package_list = await DataFind(`SELECT id, image, name, description FROM tbl_package`);
        // }

        return res.status(200).json({ ResponseCode: 401, Result: false, message: "Please try different type vehicle.!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// ============= Vehicle Module Calculate ================ //

router.post("/module_calculate", async(req, res)=>{
    try {
        const {uid, mid, mrole, pickup_lat_lon, drop_lat_lon, drop_lat_lon_list} = req.body;
        const missingField = ["uid", 'mid', 'mrole', 'pickup_lat_lon', 'drop_lat_lon'].find(field => !req.body[field]);
        if(missingField) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});
        let convertzone = await AllFunction.ZoneLatlon(pickup_lat_lon, drop_lat_lon, drop_lat_lon_list);
        // let dzone = await AllFunction.ZoneData();
        let zonecheck = await AllFunction.CheckZone(convertzone);
        if (zonecheck[1].zc != "0") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Address is not in the zone!'});
        const vehicle = await DataFind(`SELECT * FROM tbl_vehicle WHERE status = '1' AND bidding = '0' AND home_visible_status = '1'`);
        if(vehicle == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Vehicle Not Found!'});
        let zoneresult = zonecheck[0].zr, dhour = 0, dtime = 0;
        const general = await DataFind(`SELECT * FROM tbl_general_settings`);
        if(general == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});
        let cal = 0, hour = 0, time = 0, totmin = 0;
        for (let a = 1; a < zoneresult.length;) {
            let pickup = `${convertzone[a-1].latitude},${convertzone[a-1].longitude}`;
            let drop = `${convertzone[a].latitude},${convertzone[a].longitude}`;
            let distance = await AllFunction.GetDistance(pickup, drop, general[0].google_map_key);
            // KM
            cal += parseFloat(distance.dis)
            // Time
            let spltime = distance.dur.split(" ");
            if (spltime.length == "2") {
                dhour = 0; dtime = parseFloat(spltime[0]);
            } else if (spltime.length == "4") {
                dhour = parseFloat(spltime[0]); dtime = parseFloat(spltime[2]);
            }
            totmin +=  parseFloat(dhour) * 60 + parseFloat(dtime);
            hour += parseFloat(dhour); time += dtime;
            a++;
        }
        if (cal == "0") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});
        let hou_min = await AllFunction.MinuteToHour(totmin);
        let caldriver = [], cpickup = `${convertzone[0].latitude},${convertzone[0].longitude}`;
        for (let c = 0; c < vehicle.length;) {
            let veh = 0, add_distance = 0, tot_price = 0, km_charge = 0, extra_charge = 0, weather_charge = 0, extra_person_charge = 0, site_commission = 0, addtime = "";
            // get nearest driver
            const driver = await DataFind(`SELECT dr.id, COALESCE(ve.map_img, '') AS image, COALESCE(ve.name, '') AS name, COALESCE(ve.description, '') AS description,
                                            COALESCE(dr.latitude, '') AS latitude, COALESCE(dr.longitude, '') AS longitude,
                                            (
                                                6371 * ACOS(
                                                    COS(RADIANS(${Number(convertzone[0].latitude)})) * COS(RADIANS(dr.latitude)) *
                                                    COS(RADIANS(dr.longitude) - RADIANS(${Number(convertzone[0].longitude)})) +
                                                    SIN(RADIANS(${Number(convertzone[0].latitude)})) * SIN(RADIANS(dr.latitude))
                                                )
                                            ) AS distance
                                            FROM tbl_driver AS dr
                                            JOIN tbl_vehicle AS ve ON dr.vehicle = ve.id
                                            WHERE
                                            dr.vehicle = '${vehicle[c].id}' AND dr.zone IN (${zonecheck[2].zid}) AND dr.fstatus = '1' AND dr.status = '1'
                                            AND dr.approval_status = '1' AND dr.latitude NOT IN ('') AND dr.longitude NOT IN ('')
                                            HAVING distance <= ${Number(general[0].vehicle_radius)}
                                            ORDER BY distance ASC
                                            LIMIT 1`);
            if (driver.length > 0) {
                let driverl = `${driver[0].latitude},${driver[0].longitude}`;
                let dstance = await AllFunction.GetDistance(driverl, cpickup, general[0].google_map_key);
                // dkm = (Math.round(parseFloat(dstance.dis)));
                // time
                let spltime = dstance.dur.split(" ");
                if (spltime.length == "2") dtime = parseFloat(spltime[0]);
                else dtime = (parseFloat(spltime[0]) * 60) + parseFloat(spltime[2]);
                addtime = await AllFunction.AddDateMinute(parseFloat(dtime) + parseFloat(totmin)); veh = dtime;
            }
            if (cal <= vehicle[c].min_km_distance) {
                km_charge = parseFloat(cal) * parseFloat(vehicle[0].min_km_price);
            } else {
                add_distance = parseFloat(cal) - parseFloat(Number(vehicle[c].min_km_distance));
                km_charge = (parseFloat(vehicle[c].min_km_distance) * parseFloat(vehicle[0].min_km_price) + (parseFloat(add_distance) * parseFloat(vehicle[0].after_km_price)));
            }
            tot_price += km_charge;
            if (Number(vehicle[c].extra_charge) > 0) {
                tot_price = tot_price + Number(vehicle[c].extra_charge);
                extra_charge = Number(vehicle[c].extra_charge);
            }
            if (general[0].weather_type == 'fix') {
                tot_price = tot_price + Number(general[0].weather_price);
                weather_charge = Number(general[0].weather_price);
            } else {
                const weatherp = Number(((tot_price / 100) * Number(general[0].weather_price)).toFixed(2));
                tot_price = tot_price + weatherp; weather_charge = weatherp
            }
            if (vehicle[c].comission_type == 'fix') {
                tot_price = tot_price + Number(vehicle[c].comission_rate);
                site_commission = Number(vehicle[c].comission_rate);
            } else {
                const scom = Number(((tot_price / 100) * Number(vehicle[c].comission_rate)).toFixed(2));
                tot_price = tot_price + scom; site_commission = scom;
            }
            // roundkm = cal, add_distance = 0, tot_price = 0, km_charge = 0, extra_charge = 0, weather_charge = 0, extra_person_charge = 0, site_commission = 0, addtime = "";
            caldriver.push({...vehicle[c], m_role: mrole, dri_pic_time: veh, dri_pic_drop: addtime, drop_hour:hou_min.hour, drop_time:hou_min.minute,
                drop_km:Number(Number(cal).toFixed(2)), drop_price:Number(Number(tot_price).toFixed(2)), km_charge, extra_charge, weather_charge, extra_person_charge, site_commission,
                zone: zonecheck[2].zid });
            c++;
        }
        return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Address calculate successful', caldriver});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// ============= One Vehicle Calculate ================ //

async function Vehicle_calculate(uid, mid, pickup_lat_lon, drop_lat_lon, drop_lat_lon_list, status, czone, zcheck, vid) {
    let convertzone, zonecheck, v_id;
    // console.log(status);
    
    if (status == 1) {
        convertzone = await AllFunction.ZoneLatlon(pickup_lat_lon, drop_lat_lon, drop_lat_lon_list);
        
        // let dzone = await AllFunction.ZoneData();
        
        zonecheck = await AllFunction.CheckZone(convertzone);
        // console.log(zonecheck);
        if (zonecheck[1].zc != "0") return 1;

        if (mid == "") {
            let vehicle_list = await DataFind(`SELECT id, image, name, description, bidding FROM tbl_vehicle WHERE status = '1'`);
            v_id = vehicle_list[0].id;
        } else v_id = mid;

    } else {
        convertzone = czone; zonecheck = zcheck; v_id = vid;
    }
    // console.log(zonecheck[2].zid);
    
    const general = await DataFind(`SELECT * FROM tbl_general_settings`);
    if(general == "") return 2;
    
    // const driver = await DataFind(`SELECT dr.id, COALESCE(ve.map_img, '') AS image, COALESCE(ve.name, '') AS name, COALESCE(ve.description, '') AS description, 
    //                                 COALESCE(dr.latitude, '') AS latitude, COALESCE(dr.longitude, '') AS longitude 
    //                                 FROM tbl_driver AS dr
    //                                 JOIN tbl_vehicle AS ve ON dr.vehicle = ve.id
    //                                 WHERE dr.vehicle = '${v_id}'
    //                                 AND dr.latitude NOT IN ('') AND dr.longitude NOT IN ('')`);
    
    // // new
    const driver = await DataFind(`SELECT dr.id, COALESCE(ve.map_img, '') AS image, COALESCE(ve.name, '') AS name, COALESCE(ve.description, '') AS description, 
                                    COALESCE(dr.latitude, '') AS latitude, COALESCE(dr.longitude, '') AS longitude 
                                    FROM tbl_driver AS dr
                                    JOIN tbl_vehicle AS ve ON dr.vehicle = ve.id
                                    WHERE 
                                    (6371 * ACOS(
                                        COS(RADIANS(dr.latitude)) * COS(RADIANS(${Number(convertzone[0].latitude)})) *
                                        COS(RADIANS(${Number(convertzone[0].longitude)}) - RADIANS(dr.longitude)) +
                                        SIN(RADIANS(dr.latitude)) * SIN(RADIANS(${Number(convertzone[0].latitude)}))
                                    )) <= ${Number(general[0].vehicle_radius)}
                                    AND dr.vehicle = '${v_id}' AND dr.zone IN (${zonecheck[2].zid}) AND dr.fstatus = '1' AND dr.status = '1' AND dr.approval_status = '1'
                                    AND dr.latitude NOT IN ('') AND dr.longitude NOT IN ('')`);
    
    // console.log(driver);
    
    // // 
    // const driver = await DataFind(`SELECT dr.id, COALESCE(ve.map_img, '') AS image, COALESCE(ve.name, '') AS name, COALESCE(ve.description, '') AS description, 
    //                                 COALESCE(dr.latitude, '') AS latitude, COALESCE(dr.longitude, '') AS longitude 
    //                                 FROM tbl_driver AS dr
    //                                 JOIN tbl_vehicle AS ve ON dr.vehicle = ve.id
    //                                 WHERE dr.vehicle = '${v_id}' AND dr.zone IN (${zonecheck[2].zid}) AND dr.fstatus = '1' AND dr.status = '1' AND dr.approval_status = '1'
    //                                 AND dr.rid_status = '0' AND dr.latitude NOT IN ('') AND dr.longitude NOT IN ('')`);
    
    if (driver == "") return 3;

    let dkm = 0, dtime = 0;
    let cpickup = `${convertzone[0].latitude},${convertzone[0].longitude}`;
    let caldriver = [], driver_id =  [], minkm = 0, point = { latitude: Number(convertzone[0].latitude), longitude: Number(convertzone[0].longitude) };
    for (let i = 0; i < driver.length;) {
        
        // let dlotlon = { latitude: Number(driver[i].latitude), longitude: Number(driver[i].longitude) };
        // let distance = await AllFunction.RadiusCheck(point, dlotlon, Number(parseFloat(general[0].vehicle_radius) * parseFloat(1000)));
        
        // if (distance == 1) {

            if (status == "2") {

                // get distance and time
                let driverl = `${driver[i].latitude},${driver[i].longitude}`;
                let dstance = await AllFunction.GetDistance(driverl, cpickup, general[0].google_map_key);
                dkm = (Math.round(parseFloat(dstance.dis)));
        
                // time
                let spltime = dstance.dur.split(" ");
                if (spltime.length == "2") dtime = parseFloat(spltime[0]);
                else dtime = (parseFloat(spltime[0]) * 60) + parseFloat(spltime[2]);
    
                if (minkm == 0) minkm = dtime; 
                if (parseFloat(minkm) > parseFloat(dtime)) minkm = dtime;

            } else caldriver.push({id:driver[i].id, image:driver[i].image, name:driver[i].name, description:driver[i].description, latitude:driver[i].latitude, longitude:driver[i].longitude});

            driver_id.push(driver[i].id);

        // }
        i++;
    }
    
    if (status == "1") return {driver_id, caldriver};
    else return {minkm: minkm, driver_id:driver_id};
}



router.post("/vehicle_calculate", async(req, res)=>{
    try {
        const {uid, mid, pickup_lat_lon, drop_lat_lon, drop_lat_lon_list} = req.body;

        const missingField = ["uid", 'mid', 'pickup_lat_lon', 'drop_lat_lon'].find(field => !req.body[field]);
        if(missingField) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});

        console.log("vehicle_calculate");

        let convertzone = await AllFunction.ZoneLatlon(pickup_lat_lon, drop_lat_lon, drop_lat_lon_list);
        // let dzone = await AllFunction.ZoneData();
        let zonecheck = await AllFunction.CheckZone(convertzone);
        if (zonecheck[1].zc != "0") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Address is not in the zone!'});
        
        const vehicle = await DataFind(`SELECT * FROM tbl_vehicle WHERE id = '${mid}' AND status = '1'`);
        if(vehicle == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Vehicle Not Found!'});

        // let zoneresult = zonecheck[0].zr, dhour = 0, dtime = 0;
    
        const general = await DataFind(`SELECT vehicle_radius FROM tbl_general_settings`);
        if(general == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});

        const driver = await DataFind(`SELECT dr.id, COALESCE(ve.map_img, '') AS image, COALESCE(ve.name, '') AS name, COALESCE(ve.description, '') AS description,
                                        COALESCE(dr.latitude, '') AS latitude, COALESCE(dr.longitude, '') AS longitude
                                        FROM tbl_driver AS dr
                                        JOIN tbl_vehicle AS ve ON dr.vehicle = ve.id
                                        WHERE
                                        (6371 * ACOS(
                                            COS(RADIANS(dr.latitude)) * COS(RADIANS(${Number(convertzone[0].latitude)})) *
                                            COS(RADIANS(${Number(convertzone[0].longitude)}) - RADIANS(dr.longitude)) +
                                            SIN(RADIANS(dr.latitude)) * SIN(RADIANS(${Number(convertzone[0].latitude)}))
                                        )) <= ${Number(general[0].vehicle_radius)}
                                        AND dr.vehicle = '${vehicle[0].id}' AND JSON_CONTAINS(dr.zone, '${zonecheck[2].zid}', '$') AND dr.fstatus = '1' AND dr.status = '1'
                                        AND dr.approval_status = '1' AND dr.latitude NOT IN ('') AND dr.longitude NOT IN ('')`);

        return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Address calculate successful', caldriver: driver});

        // let caldata = await Vehicle_calculate(uid, mid, pickup_lat_lon, drop_lat_lon, drop_lat_lon_list, 1)
        // if (caldata == "1") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Address is not in the zone!'});
        // if (caldata == "2") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});
        // if (caldata == "3") return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Driver not found!', driver_id: [], caldriver: []});
        // if (caldata == "4") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Vehicle Not Found!'});
        // if (caldata == "5") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});
        
        // return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Address calculate successful', driver_id:caldata.driver_id, caldriver:caldata.caldriver});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});




router.post("/add_vehicle_request", async(req, res)=>{
    try {
        let {uid, vehicle_id, tot_km, tot_hour, tot_minute, bidding, bidd_auto_status, drop_price, bid_addjust_amount, km_charge, extra_charge, weather_charge, extra_person_charge, 
            site_commission, coupon_id, payment_id, zone, pickup, drop, droplist, pickupadd, dropadd, droplistadd} = req.body;
        
        const missingField = await AllFunction.BodyNumberDataCheck(["uid", "vehicle_id", "tot_km", "tot_hour", "tot_minute", "bidding", "bidd_auto_status", "drop_price", 
            "bid_addjust_amount", "km_charge", "extra_charge", "weather_charge", "extra_person_charge", "site_commission", "zone", "pickup", "drop", "droplist", "pickupadd", 
            "dropadd", "droplistadd"], req.body);
            
        if (missingField.status == false) return res.status(200).json({ ResponseCode: 401, Result:false, message: missingField.message });

            
        // if(missingField) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});

        let convertz = await AllFunction.ZoneLatlon(pickup, drop, droplist), bid_d = [], coupon_price = 0;
        // console.log(driverid);

        const general = await DataFind(`SELECT default_payment, vehicle_radius FROM tbl_general_settings`);
        let payment = payment_id == "0" ? general[0].default_payment : payment_id;
        
        let caldata = await AllFunction.AvailableDriverGet(convertz[0].latitude, convertz[0].longitude, general[0].vehicle_radius, `vehicle = '${vehicle_id}'`, zone, 1);
        if (caldata.status == false) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'No drivers found nearby. Please try again shortly.!'});

        let pic = "", dropdata = "", picadd = "", dropad = "", alcount = 0, drocount = 2, tkm = parseFloat(parseFloat(tot_km).toFixed(2));

        for (let i = 0; i < convertz.length;) {
            if (i == "0") pic = convertz[i].latitude + "&!" + convertz[i].longitude
            else dropdata += dropdata == "" ? convertz[i].latitude + "&!" + convertz[i].longitude : "&!!" + convertz[i].latitude + "&!" + convertz[i].longitude;
            alcount++;
            i++;
        }

        picadd = pickupadd.title + "&!" + pickupadd.subt; dropad = dropadd.title + "&!" + dropadd.subt;
        if (droplistadd && droplistadd != "") {
            for (let a = 0; a < droplistadd.length;) {
                dropad += dropad == "" ? droplistadd[a].title + "&!" + droplistadd[a].subt : "&!!" + droplistadd[a].title + "&!" + droplistadd[a].subt;
                drocount++;
                a++;
            }
        }
        if(alcount != drocount) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Location details are incomplete.'});

        // const vehicle_list = await DataFind(`SELECT * FROM tbl_vehicle WHERE id = '${vehicle_id}' AND status = '1'`);

        // // // // // Send Notification
        for (let  i = 0; i < caldata.idlist.length; ) {
            sendOneNotification("New ride request received! Ready to go!", 'driver', caldata.idlist[i]);
            i++;
        }
        
        let date = new Date().toISOString(), bidd_auto_st = bidd_auto_status == "true" ? '1' : '0';

        if (coupon_id != '') {
            const cl = await DataFind(`SELECT * FROM tbl_coupon WHERE id = '${coupon_id}'`);
            if (cl.length > 0) {
                if (new Date(date) >= new Date(cl[0].start_date) || new Date(date) <= new Date(cl[0].end_date)) {
                    let totpc = drop_price - site_commission
                    if (totpc >= Number(cl[0].min_amount)) {
                        drop_price -= Number(cl[0].discount_amount); coupon_price = Number(cl[0].discount_amount);
                    }
                } else return res.status(200).json({ ResponseCode: 401, Result: false, message: `Invalid coupon applied!` });
            } else return res.status(200).json({ ResponseCode: 401, Result: false, message: `Coupon not found!` });
        }

        let bidd_amount_dif = '', fnala = 0

        const dropa = Number(drop_price);
        const bidAdjust = Number(bid_addjust_amount);

        if (bidding == 1 && dropa !== bidAdjust) {
            const diff = Number((Math.abs(dropa - bidAdjust)).toFixed(2));
            
            if (dropa < bidAdjust) {
                console.log('111');
                
                fnala = Number((bidAdjust - diff).toFixed(2));
                bidd_amount_dif = `+ ${diff}`;
            } else {
                console.log('222');

                fnala = Number((dropa - diff).toFixed(2));
                bidd_amount_dif = `- ${diff}`;
            }
        } else {
            fnala = dropa; bidd_amount_dif = '';
        }
        
        let id = await DataInsert(`tbl_request_vehicle`, `c_id, d_id, vehicleid, bidding_d_price, bidding_status, bidd_auto_status, status, m_role, price, paid_amount, 
            bid_addjust_amount, km_charge, extra_charge, weather_charge, platform_fee, extra_person_charge, day_charge, rent_hour, rental_hour_charge, rental_per_hour_discount, 
            rental_extra_km, rental_extra_km_charge, tot_kg, kg_charge, coupon_id, coupon_price, payment_id, tot_km, tot_hour, tot_minute, package_details, zone, status_time_location, 
            start_time, pic_lat_long, drop_lat_long, pic_address, drop_address, outs_category_id, mod_cate_id, num_passenger, book_date, book_time`,
            `'${uid}', '${JSON.stringify(caldata.idlist)}', '${vehicle_id}', '', '${bidding}', '${bidd_auto_st}', '0', '1', '${bid_addjust_amount == '0' ? drop_price : bid_addjust_amount }', 
            '0', '${bidd_amount_dif}', '${km_charge}', '${extra_charge}', '${weather_charge}', '${site_commission}', '${extra_person_charge}', '0', '0', '0', '0', '0', '0', '0', '0', 
            '${coupon_id}', '${coupon_price}', '${payment}', '${tot_km}', '${tot_hour}', '${tot_minute}', '[]', '${JSON.stringify(zone)}', '', '${date}', '${pic}', '${dropdata}', 
            ${mysql.escape(picadd)}, ${mysql.escape(dropad)}, '', '', '0', '', ''`, req.hostname, req.protocol);
            
        if (id == -1) return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });


        return res.status(200).json({ ResponseCode: 200, Result:true, message: `We’ve sent ${caldata.idlist.length} captain requests; they’ll confirm shortly.`, id:id.insertId,
            driver_id: caldata.idlist});

        // if (data == "") {
            // id = await DataInsert(`tbl_request_vehicle`, `c_id, d_id, bidding_d_price, bidding_status, bidd_auto_status, pic_lat_long, drop_lat_long, pic_address, drop_address, price, 
            //     tot_km, tot_hour, tot_minute, vehicleid, payment_id, status, status_time_location, m_role, coupon_id, start_time`, 
            //     `'${uid}', '${senddataJson}', '', '${vehicle_list[0].bidding}', '${bidd_auto_st}', '${pic}', '${dropdata}', '${picadd}', '${dropad}', '${price}', 
            //     '${tkm}', '${tot_hour}', '${tot_minute}', '${vehicle_id}', '${payment}', '0', '', '${m_role}', '${coupon_id}', '${date}'`, req.hostname, req.protocol);
                
            // if (id == -1) return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
            // return res.status(200).json({ ResponseCode: 200, Result:true, message: `We’ve sent ${driverid.length} captain requests; they’ll confirm shortly.`, id:id.insertId});
        // }
        
        // else {
            
        //     if (await DataUpdate(`tbl_request_vehicle`, `d_id = '${senddataJson}', bidding_d_price = '', bidding_status = '${vehicle_list[0].bidding}', bidd_auto_status = '${bidd_auto_st}', 
        //         pic_lat_long = '${pic}', drop_lat_long = '${dropdata}', pic_address = '${picadd}', drop_address = '${dropad}', price = '${price}', tot_km = '${tkm}', tot_hour = '${tot_hour}', 
        //         tot_minute = '${tot_minute}', vehicleid = '${vehicle_id}', payment_id = '${payment}', status = '0', status_time_location = '', m_role = '${m_role}', coupon_id = '${coupon_id}', 
        //         start_time = '${date}'`, `id = '${data[0].id}'`, req.hostname, req.protocol) == -1) {
                    
        //         return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
        //     }
        //     return res.status(200).json({ ResponseCode: 200, Result:true, message: `We’ve sent ${driverid.length} captain requests; they’ll confirm shortly.`, id:data[0].id});
        // }

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

router.get("/vehicle_cancel_reason", async(req, res)=>{
    try {
        const ride_cancel_list = await DataFind(`SELECT id, title FROM tbl_ride_cancel_reason WHERE status = '1'`);
        
        return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Data Load Successful', ride_cancel_list});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

router.get("/review_data", async(req, res)=>{
    try {
        const review_list = await DataFind(`SELECT * FROM tbl_ride_review_reason WHERE status = '1'`);
        
        return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Data Load Successful', review_list});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

router.post("/vehicle_live_location", async(req, res)=>{
    try {
        const {uid, d_id} = req.body;

        if(!uid || !d_id) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});
        
        const data = await DataFind(`SELECT * FROM tbl_cart_vehicle WHERE c_id = '${uid}' AND d_id = '${d_id}'`);
        if(data == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Request Not Found!'});

        const driver = await DataFind(`SELECT dr.id, COALESCE(ve.map_img, '') AS image, COALESCE(ve.name, '') AS name, COALESCE(ve.description, '') AS description, 
                                        COALESCE(dr.latitude, '') AS latitude, COALESCE(dr.longitude, '') AS longitude 
                                        FROM tbl_driver AS dr
                                        JOIN tbl_vehicle AS ve ON dr.vehicle = ve.id AND ve.id = dr.vehicle
                                        WHERE dr.id = '${data[0].d_id}' AND dr.fstatus = '1' AND dr.status = '1' AND dr.approval_status = '1' AND dr.latitude NOT IN ('') AND dr.longitude NOT IN ('')`);
        
        return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Data Load Successful', driver_location:driver[0]});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

router.post("/timeout_vehicle_request", async(req, res)=>{
    try {
        const {request_id, uid} = req.body;

        if(!request_id || !uid) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});
        
        const data = await DataFind(`SELECT * FROM tbl_request_vehicle WHERE c_id = '${uid}'`);
        if(data == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Request Not Found!'});

        if (await DataDelete(`tbl_request_vehicle`, `id = '${request_id}' AND c_id = '${uid}'`, req.hostname, req.protocol) == -1) {
            return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
        }

        if (await DataUpdate(`tbl_request_vehicle`, `d_id = '[]', status = '0'`, `c_id = '${uid}'`, req.hostname, req.protocol) == -1) {  
            return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
        }

        let array = data[0].d_id
        if (typeof array == "string") array = JSON.parse(array);
        
        return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Request Out successful', id:data[0].id, driverid:array});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})



router.post("/resend_vehicle_request", async(req, res)=>{
    try {
        const {uid, driverid} = req.body;

        if(!uid || !driverid) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});
        
        const data = await DataFind(`SELECT * FROM tbl_request_vehicle WHERE c_id = '${uid}'`);
        if(data == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Request Not Found!'});

        let pl = data[0].pic_lat_long.split("&!"), dl = data[0].drop_lat_long.split("&!!"), drop_lat_lon = "", drop_lat_lon_list = []
        for (let i = 0; i < dl.length;) {
            let dspl = dl[i].split("&!");
            if (i == "0") drop_lat_lon = `${dspl[0]},${dspl[1]}`;
            else {
                drop_lat_lon_list.push({ "lat": dspl[0],"long": dspl[1] });
            }
            i++;
        }

        const general = await DataFind(`SELECT id, vehicle_radius FROM tbl_general_settings`);

        let convertzone = await AllFunction.ZoneLatlon(`${pl[0]},${pl[1]}`, drop_lat_lon, drop_lat_lon_list);
        
        // let dzone = await AllFunction.ZoneData();
        let zonecheck = await AllFunction.CheckZone(convertzone);
        if (zonecheck[1].zc != "0") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Address is not in the zone!'});

        let caldata = await AllFunction.AvailableDriverGet(pl[0], pl[1], general[0].vehicle_radius, `vehicle = '${data[0].vehicleid}'`, zonecheck[2].zid, 1);

        // let caldata = await Vehicle_calculate(uid, data[0].vehicleid, `${pl[0]},${pl[1]}`, drop_lat_lon, drop_lat_lon_list, 1);
        // if (caldata == "1") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Address is not in the zone!'});
        // if (caldata == "2") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});
        // if (caldata == "3") return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Driver not found!', driver_id: [], caldriver: []});
        // if (caldata == "4") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Vehicle Not Found!'});
        // if (caldata == "5") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});

        let d_id = caldata.driver_id, senddataJson;
        if (typeof d_id == "string") {
            d_id = JSON.parse(d_id);
            senddataJson = JSON.stringify(d_id);
        } else senddataJson = JSON.stringify(d_id);

        // bidding_d_price, bidding_status, bidd_auto_status
        if (await DataUpdate(`tbl_request_vehicle`, `d_id = '${senddataJson}', bidding_d_price = '', status = '0'`, `c_id = '${uid}'`, req.hostname, req.protocol) == -1) {
            return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
        }
        return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Request Resend successful', id:data[0].id, driver_list: JSON.parse(senddataJson)});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

router.post("/remove_vehicle_request", async(req, res)=>{
    try {
        const {uid} = req.body;

        if(!uid) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});
        
        const data = await DataFind(`SELECT * FROM tbl_request_vehicle WHERE c_id = '${uid}'`);
        if(data == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Request Not Found!'});

        if (await DataDelete(`tbl_request_vehicle`, `c_id = '${uid}'`, req.hostname, req.protocol) == -1) {
            return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
        }

        let array = data[0].d_id;
        if (typeof array == "string") array = JSON.parse(array);

        return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Request Cancel successful', id:data[0].id, driver_list:array});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

router.post("/vehicle_ride_cancel", async(req, res)=>{
    try {
        const {uid, request_id, cancel_id, lat, lon} = req.body;
        if(!uid || !request_id || !cancel_id || !lat || !lon) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});
        console.log(req.body);
        let rd, indata, fulldate = await AllFunction.TodatDate(), status = "4", driver_list = [];
        rd = await DataFind(`SELECT * FROM tbl_request_vehicle WHERE id = '${request_id}' AND c_id = '${uid}'`);
        if(rd == "") {
            rd = await DataFind(`SELECT * FROM tbl_cart_vehicle WHERE (id = '${request_id}' OR req_id = '${request_id}') AND c_id = '${uid}'`);
            if(rd == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Request Not Found!'});
            let updatet = rd[0].status_time_location != "" ? `${rd[0].status_time_location}&!!${status}&${fulldate.date}T${fulldate.time}&${lat}&${lon}` :
            `${status}&${fulldate.date}T${fulldate.time}&${lat}&${lon}`;
            driver_list = [ parseFloat(rd[0].d_id) ];
            let setime = rd[0].status_time_location.split("&!!"), starttime = "";
            // let stime = setime[0].split("&"), etime = setime[setime.length - 1].split("&");
            let stime = setime[0].split("&"), etime = new Date().toISOString();
            if (stime[0] == "1") starttime = await AllFunction.TodatDate(stime[1]);
            const packd = typeof rd[0].package_details == "string" ? JSON.parse(rd[0].package_details) : rd[0].package_details;
            const jzone = typeof rd[0].zone == "string" ? JSON.parse(rd[0].zone) : rd[0].zone;
            indata = await DataInsert(`tbl_order_vehicle`, `c_id, d_id, vehicleid, bidding_status, bidd_auto_status, status, m_role, paid_status, price, final_price, paid_amount,
                bid_addjust_amount,
                km_charge, additional_time, addi_time_price, platform_fee, weather_price, coupon_id, coupon_amount, wallet_price, extra_charge, extra_person_charge, day_charge,
                rent_hour, rental_addi_ride_time, rental_addi_ride_charge, rental_hour_charge, rental_per_hour_discount, rental_extra_km, rental_extra_km_charge, tot_kg, kg_charge,
                payment_id, tot_km, tot_hour, tot_minute, package_details, zone, ride_status, start_time, end_time, drop_tot, drop_complete, current_run_time, status_time,
                status_time_location, status_calculation, pic_lat_long, drop_lat_long, pic_address, drop_address, payment_img, cancel_reason, outs_category_id, mod_cate_id,
                num_passenger, book_date, book_time, req_id`,
                `'${rd[0].c_id}', '${rd[0].d_id}', '${rd[0].vehicleid}', '${rd[0].bidding_status}', '${rd[0].bidd_auto_status}', '4', '${rd[0].m_role}', '0', '${rd[0].price}',
                '${rd[0].final_price}', '0', '${rd[0].bid_addjust_amount}', '${rd[0].km_charge}', '${rd[0].additional_time}', '${rd[0].addi_time_price}', '${rd[0].platform_fee}', '${rd[0].weather_price}',
                '${rd[0].coupon_id}', '${rd[0].coupon_amount}', '0', '${rd[0].extra_charge}', '${rd[0].extra_person_charge}', '${rd[0].day_charge}', '${rd[0].rent_hour}',
                '${rd[0].rental_addi_ride_time}', '${rd[0].rental_addi_ride_charge}', '${rd[0].rental_hour_charge}', '${rd[0].rental_per_hour_discount}', '${rd[0].rental_extra_km}',
                '${rd[0].rental_extra_km_charge}', '${rd[0].tot_kg}', '${rd[0].kg_charge}', '${rd[0].payment_id}', '${rd[0].tot_km}', '${rd[0].tot_hour}', '${rd[0].tot_minute}',
                '${JSON.stringify(packd)}', '${JSON.stringify(jzone)}', '${rd[0].ride_status}', '${stime[1]}', '${etime}', '${rd[0].drop_tot}', '${rd[0].drop_complete}',
                '${rd[0].current_run_time}', '${rd[0].status_time}', '${updatet}', '', '${rd[0].pic_lat_long}', '${rd[0].drop_lat_long}', ${mysql.escape(rd[0].pic_address)},
                ${mysql.escape(rd[0].drop_address)}, '', '${cancel_id}', '${rd[0].outs_category_id}', '${rd[0].mod_cate_id}', '${rd[0].num_passenger}', '${rd[0].book_date}',
                '${rd[0].book_time}', '${rd[0].id}'`, req.hostname, req.protocol);
            if (indata == -1) return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
            if (await DataDelete(`tbl_cart_vehicle`, `id = '${rd[0].id}'`, req.hostname, req.protocol) == -1) {
                return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
            }
            if (await DataUpdate(`tbl_driver`, `rid_status = '0' AND check_status = '0'`, `id = '${rd[0].d_id}'`, req.hostname, req.protocol) == -1) {
                return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
            }
        } else {
            let updatet = rd[0].status_time_location != "" ? `${rd[0].status_time_location}&!!${status}&${fulldate.date}T${fulldate.time}&${lat}&${lon}` :
                        `${status}&${fulldate.date}T${fulldate.time}&${lat}&${lon}`;
            let dropcount = rd[0].drop_lat_long.split("&!!").length, driver_list = rd[0].d_id;
            if (typeof rd[0].d_id == "string") driver_list = JSON.parse(rd[0].d_id);
            const packd = typeof rd[0].package_details == "string" ? JSON.parse(rd[0].package_details) : rd[0].package_details;
            const jzone = typeof rd[0].zone == "string" ? JSON.parse(rd[0].zone) : rd[0].zone;
            indata = await DataInsert(`tbl_order_vehicle`, `c_id, d_id, vehicleid, bidding_status, bidd_auto_status, status, m_role, paid_status, price, final_price, paid_amount,
                bid_addjust_amount, km_charge, additional_time, addi_time_price, platform_fee, weather_price, coupon_id, coupon_amount, wallet_price, extra_charge, extra_person_charge, day_charge,
                rent_hour, rental_addi_ride_time, rental_addi_ride_charge, rental_hour_charge, rental_per_hour_discount, rental_extra_km, rental_extra_km_charge, tot_kg, kg_charge,
                payment_id, tot_km, tot_hour, tot_minute, package_details, zone, ride_status, start_time, end_time, drop_tot, drop_complete, current_run_time, status_time,
                status_time_location, status_calculation, pic_lat_long, drop_lat_long, pic_address, drop_address, payment_img, cancel_reason, outs_category_id, mod_cate_id,
                num_passenger, book_date, book_time, req_id`,
                `'${rd[0].c_id}', '${rd[0].d_id}', '${rd[0].vehicleid}', '${rd[0].bidding_status}', '${rd[0].bidd_auto_status}', '4', '${rd[0].m_role}', '0', '${rd[0].price}',
                '0', '0', '${rd[0].bid_addjust_amount}', '${rd[0].km_charge}', '0', '0', '${rd[0].platform_fee}', '${rd[0].weather_price}', '${rd[0].coupon_id}', '${rd[0].coupon_amount}', '0', '${rd[0].extra_charge}',
                '${rd[0].extra_person_charge}', '${rd[0].day_charge}', '${rd[0].rent_hour}', '${rd[0].rental_addi_ride_time}', '${rd[0].rental_addi_ride_charge}', '${rd[0].rental_hour_charge}',
                '${rd[0].rental_per_hour_discount}', '${rd[0].rental_extra_km}', '${rd[0].rental_extra_km_charge}', '${rd[0].tot_kg}', '${rd[0].kg_charge}', '${rd[0].payment_id}',
                '${rd[0].tot_km}', '${rd[0].tot_hour}', '${rd[0].tot_minute}', '${JSON.stringify(packd)}', '${JSON.stringify(jzone)}', '0', '', '', '${dropcount}', '', '', '',
                '${updatet}', '', '${rd[0].pic_lat_long}', '${rd[0].drop_lat_long}', ${mysql.escape(rd[0].pic_address)}, ${mysql.escape(rd[0].drop_address)}, '', '${cancel_id}',
                '${rd[0].outs_category_id}', '${rd[0].mod_cate_id}', '${rd[0].num_passenger}', '${rd[0].book_date}', '${rd[0].book_time}', '${rd[0].id}'`, req.hostname, req.protocol);
            if (indata == -1) return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
            if (await DataDelete(`tbl_request_vehicle`, `id = '${rd[0].id}'`, req.hostname, req.protocol) == -1) {
                return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
            }
        }
        return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Request Cancel successful', driverid:driver_list});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})


router.post("/vehicle_ride_addstatus", async(req, res)=>{
    try {
        const {uid, d_id, request_id} = req.body;
        if(!uid || !d_id || !request_id) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});

        const rd = await DataFind(`SELECT * FROM tbl_cart_vehicle WHERE id = '${request_id}' AND c_id = '${uid}' AND d_id = '${d_id}'`);
        if (rd == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Request Not Found!' });

        if (rd[0].status == "3") {
            if (rd[0].ride_status != "0") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Please Complete Other Stap!' });
        } else if (rd[0].status == "6") {
            if (rd[0].ride_status != "6") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Please Complete Other Stap!' });
        } 
        if (rd[0].status == "0" || rd[0].status == "1" || rd[0].status == "2" || rd[0].status == "4" || rd[0].status == "5" || rd[0].status == "7" || rd[0].status == "8") {
            return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Please Complete Other Stap!' });
        }

        let dlatlon = rd[0].drop_lat_long.split("&!!"), daddress = rd[0].drop_address.split("&!!"), pending_ride = "", drop_list = [];
        
        if (rd[0].drop_complete == "") pending_ride = 0;
        else pending_ride = parseFloat(rd[0].drop_complete) + 1;

        let ccheck = await AllFunction.CheckCurrentLocation(pending_ride, dlatlon, daddress);

        for (let i = 0; i < dlatlon.length;) {
            let checkadd = daddress[i].split("&!"), checkl = dlatlon[i].split("&!"), status = "";

            if (pending_ride == i) status = "2";
            if (pending_ride > i) status = "3";
            if (pending_ride < i) status = "1";

            drop_list.push({ status: status, title: checkadd[0], subtitle: checkadd[1], latitude: checkl[0], longitude: checkl[1] });
            i++;
        }
        
        return res.status(200).json({ ResponseCode: 200, Result:true, message: "Service Start Successful", current_address:ccheck.current_address, 
            next_address:ccheck.next_address, drop_list });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})



// ============= Vehicle Driver detail ================ //

router.post("/vehicle_driver_detail", async(req, res)=>{
    try {
        const {uid, d_id, request_id} = req.body;

        if(!uid || !d_id) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong' });

        let dr = await AllFunction.DriverReview("cve");
        let rd = await DataFind(`SELECT cve.id, cve.c_id, cve.d_id, cve.price, cve.tot_km, cve.status, cve.otp, cve.tot_hour, cve.tot_minute,
                                COALESCE(dr.profile_image, "") AS profile_image, COALESCE(dr.vehicle_image, "") AS vehicle_image, COALESCE(dr.first_name, "") AS first_name, 
                                COALESCE(dr.last_name, "") AS last_name, COALESCE(dr.primary_ccode, "") AS primary_ccode, COALESCE(dr.primary_phoneNo, "") AS primary_phoneNo, 
                                COALESCE(dr.language, "") AS language, COALESCE(dr.vehicle_number, "") AS vehicle_number, COALESCE(dr.car_color, "") AS car_color, 
                                COALESCE(dr.passenger_capacity, "") AS passenger_capacity, COALESCE(GROUP_CONCAT(DISTINCT vr.name SEPARATOR ','), '') AS prefrence_name,
                                COALESCE(dr.date, "") AS join_date, COALESCE(dr.latitude, "") AS latitude, COALESCE(dr.longitude, "") AS longitude, COALESCE(vec.map_img, "") AS map_img, 
                                COALESCE(vec.name, "") AS car_name
                                ${dr.tot_review} ${dr.avgstar}, COALESCE(COUNT(DISTINCT ov.id), 0) AS tot_complete_order
                                FROM tbl_cart_vehicle AS cve
                                JOIN tbl_driver AS dr ON cve.d_id = dr.id
                                JOIN tbl_vehicle AS vec ON dr.vehicle = vec.id
                                LEFT JOIN tbl_vehicle_preference AS vr ON FIND_IN_SET(vr.id, dr.vehicle_prefrence) > 0
                                LEFT JOIN tbl_order_vehicle AS ov ON cve.d_id = ov.d_id
                                ${dr.table}
                                WHERE ${request_id != "" ? `cve.id = '${request_id}' AND` : ``}  cve.c_id = '${uid}' AND cve.d_id = '${d_id}' GROUP BY cve.id`);
        
        if (rd != "") {
            rd[0].rating = parseFloat(rd[0].avg_star); rd[0].tot_review = parseFloat(rd[0].tot_review); rd[0].tot_hour = parseFloat(rd[0].tot_hour); rd[0].tot_minute = parseFloat(rd[0].tot_minute)
            delete rd[0].avg_star
            return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Driver Data Load Successful', accepted_d_detail:rd[0] });                     
        } else {
            return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Data Not Found!', accepted_d_detail:[] });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})



// ============= Driver Profile Detail ================ //

router.post("/driver_profile_detail", async(req, res)=>{
    try {
        const {d_id} = req.body;
        if(!d_id) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong' });

        let dr = await AllFunction.DriverReview("dr");
        let rd = await DataFind(`SELECT dr.profile_image, dr.vehicle_image, dr.first_name, dr.last_name, dr.primary_ccode, dr.primary_phoneNo, dr.language, dr.vehicle_number, dr.car_color,
                                dr.passenger_capacity, dr.date AS join_date, 
                                COALESCE(GROUP_CONCAT(DISTINCT vr.name SEPARATOR ','), '') AS prefrence_name, COALESCE(vec.name, "") AS car_name
                                ${dr.tot_review} ${dr.avgstar}, COALESCE(COUNT(DISTINCT ov.id), 0) AS tot_complete_order
                                FROM tbl_driver AS dr
                                JOIN tbl_vehicle AS vec ON dr.vehicle = vec.id
                                LEFT JOIN tbl_vehicle_preference AS vr ON FIND_IN_SET(vr.id, dr.vehicle_prefrence) > 0
                                LEFT JOIN tbl_order_vehicle AS ov ON dr.id = dr.id
                                ${dr.outtable}
                                WHERE dr.id = '${d_id}' GROUP BY dr.id`);
        
        if (rd != "") {
            rd[0].rating = parseFloat(rd[0].avg_star); rd[0].tot_review = parseFloat(rd[0].tot_review);
            delete rd[0].avg_star
            return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Driver Data Load Successful', d_detail:rd[0] });                     
        } else {
            return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Data Not Found!', d_detail:[] });              
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})



// ============= Complete Ride ================ //

router.post("/vehicle_ride_complete", upload.single('payment_img'), async(req, res)=>{
    try {
        const {uid, d_id, request_id, wallet, payment_id} = req.body;
        
        if(!uid || !d_id || !request_id || !wallet) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});
        console.log(req.body);
        
        const rd = await DataFind(`SELECT * FROM tbl_cart_vehicle WHERE (id = '${request_id}' OR req_id = '${request_id}') AND c_id = '${uid}' AND d_id = '${d_id}'`);
        if(rd.length == 0) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Request Not Found!'});

        const dr = await DataFind(`SELECT * FROM tbl_driver WHERE id = '${rd[0].d_id}'`);
        if(dr.length == 0) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Request Not Found!'});
        
        if(parseFloat(rd[0].status) < 7) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Please Complete Other Step!'});
        
        const customer = await DataFind(`SELECT * FROM tbl_customer WHERE status = 1 AND id = '${uid}'`);
        if(customer == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Customer not found!'});

        let setime = rd[0].status_time_location.split("&!!"), starttime = "", end_time = "", imageUrl = "", paid_amount = 0, paid_status = 0;
        let stime = setime[0].split("&"), etime = setime[setime.length - 1].split("&");

        // if (stime[0] == "1") starttime = await AllFunction.TodatDate(stime[1]);
        // if (etime[0] == "7") end_time = await AllFunction.TodatDate(etime[1]);
        // if (starttime == "" && end_time == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Please Complete Other Step!'});

        if (rd[0].payment_id == "10" || rd[0].payment_id == "11") {

           if (!req.file) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Please Upload Image!'});
           imageUrl = req.file ? "uploads/payment_proof/" + req.file.filename : null;
        }

        paid_amount = 0; paid_status = 1, fullwallet = parseFloat(dr[0].wallet), cash = 0, tot_cash = 0, payout_wallet = 0, fulldate = await AllFunction.TodatDate();
        // Add Driver Amount
        const nwallet_amount = parseFloat((parseFloat(rd[0].price) + parseFloat(rd[0].addi_time_price) + parseFloat(rd[0].weather_price)).toFixed(2));

        if (Number(wallet) > 0) {
            console.log(Number(wallet));
            
            if (Number(rd[0].final_price) > Number(wallet)) {
                paid_amount = parseFloat((parseFloat(rd[0].final_price) - parseFloat(wallet)).toFixed(2));
                // paid_amount = Online Amount
                if (parseFloat(rd[0].platform_fee) > parseFloat(paid_amount) && payment_id == "9") {
                    cash = parseFloat((parseFloat(rd[0].platform_fee) - parseFloat(paid_amount)).toFixed(2));
                }
            }
            
            let cdata = customer[0].wallet, wamount = 0;
            console.log(cdata || cdata != "0" || cdata != "NaN");
            console.log(cdata);
            
            
            if (cdata || cdata != "0" || cdata != "NaN") wamount = cdata;
            let wallet_amount = parseFloat((parseFloat(wamount) - parseFloat(wallet)).toFixed(2));
            console.log("wallet_amount");
            console.log(wallet_amount);
            
            if (await DataUpdate(`tbl_customer`, `wallet = '${wallet_amount}'`, `id = '${uid}'`, req.hostname, req.protocol) == -1) {
                return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
            }

            if (payment_id == "9") {
                fullwallet = parseFloat((parseFloat(dr[0].wallet) + parseFloat(nwallet_amount)).toFixed(2));
                payout_wallet = parseFloat((parseFloat(dr[0].payout_wallet) + parseFloat(wallet)).toFixed(2));
            }

        } else {
            paid_amount = parseFloat(rd[0].final_price);
            if (payment_id != "9") fullwallet = parseFloat((parseFloat(dr[0].wallet) + parseFloat(nwallet_amount)).toFixed(2));
        }
        
        if (payment_id == "9") {
            if (wallet == 0) payout_wallet = parseFloat(dr[0].payout_wallet);
            if (cash == 0) tot_cash = parseFloat((parseFloat(dr[0].tot_cash) + parseFloat(rd[0].platform_fee)).toFixed(2));
            else tot_cash = parseFloat((parseFloat(dr[0].tot_cash) + parseFloat(cash)).toFixed(2));
        } else {
            payout_wallet = parseFloat((parseFloat(dr[0].payout_wallet) + parseFloat(nwallet_amount)).toFixed(2));
            tot_cash = parseFloat(dr[0].tot_cash);
        }

        if (await DataUpdate(`tbl_driver`,`wallet = '${fullwallet}', payout_wallet = '${payout_wallet}', tot_cash = '${tot_cash}', rid_status = '0' AND check_status = '0'`, 
            `id = '${rd[0].d_id}'`, req.hostname, req.protocol) == -1) {
            return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
        }

        const packd = typeof rd[0].package_details == "string" ? JSON.parse(rd[0].package_details) : rd[0].package_details;
        const jzone = typeof rd[0].zone == "string" ? JSON.parse(rd[0].zone) : rd[0].zone;

        let updatet = rd[0].status_time_location != "" ? `${rd[0].status_time_location}&!!8&${fulldate.date}T${fulldate.time}&0&0` : 
                        `8&${fulldate.date}T${fulldate.time}&0&0`;
        
        let insertid = await DataInsert(`tbl_order_vehicle`, `c_id, d_id, vehicleid, bidding_status, bidd_auto_status, status, m_role, paid_status, price, final_price, paid_amount, 
            bid_addjust_amount, km_charge, additional_time, addi_time_price, platform_fee, weather_price, coupon_id, coupon_amount, wallet_price, extra_charge, extra_person_charge, day_charge, rent_hour, 
            rental_addi_ride_time, rental_addi_ride_charge, rental_hour_charge, rental_per_hour_discount, rental_extra_km, 
            rental_extra_km_charge, tot_kg, kg_charge, payment_id, tot_km, tot_hour, tot_minute, package_details, zone, ride_status, start_time, end_time, drop_tot, drop_complete, 
            current_run_time, status_time, status_time_location, status_calculation, pic_lat_long, drop_lat_long, pic_address, drop_address, payment_img, cancel_reason, 
            outs_category_id, mod_cate_id, num_passenger, book_date, book_time, req_id`,

            `'${rd[0].c_id}', '${rd[0].d_id}', '${rd[0].vehicleid}', '${rd[0].bidding_status}', '${rd[0].bidd_auto_status}', '8', '${rd[0].m_role}', '${paid_status}', '${rd[0].price}', 
            '${rd[0].final_price}', '${paid_amount}', '${rd[0].bid_addjust_amount}', '${rd[0].km_charge}', '${rd[0].additional_time}', '${rd[0].addi_time_price}', '${rd[0].platform_fee}', '${rd[0].weather_price}', 
            '${rd[0].coupon_id}', '${rd[0].coupon_amount}', '${wallet}', '${rd[0].extra_charge}', '${rd[0].extra_person_charge}', '${rd[0].day_charge}', '${rd[0].rent_hour}', '${rd[0].rental_addi_ride_time}', 
            '${rd[0].rental_addi_ride_charge}', '${rd[0].rental_hour_charge}', 
            '${rd[0].rental_per_hour_discount}', '${rd[0].rental_extra_km}', '${rd[0].rental_extra_km_charge}', '${rd[0].tot_kg}', '${rd[0].kg_charge}', '${rd[0].payment_id}', 
            '${rd[0].tot_km}', '${rd[0].tot_hour}', '${rd[0].tot_minute}', '${JSON.stringify(packd)}', '${JSON.stringify(jzone)}', '${rd[0].ride_status}', '${stime[1]}', '${etime[1]}', 
            '${rd[0].drop_tot}', '${rd[0].drop_complete}', '${rd[0].current_run_time}', '${rd[0].status_time}', '${updatet}', '${rd[0].status_calculation}', '${rd[0].pic_lat_long}', 
            '${rd[0].drop_lat_long}', ${mysql.escape(rd[0].pic_address)}, ${mysql.escape(rd[0].drop_address)}, '${imageUrl}', '', '${rd[0].outs_category_id}', '${rd[0].mod_cate_id}', '${rd[0].num_passenger}', '${rd[0].book_date}', 
            '${rd[0].book_time}', '${rd[0].id}'`, req.hostname, req.protocol);

        
        if (insertid == -1) return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
        
        if (await DataDelete(`tbl_cart_vehicle`, `id = '${rd[0].id}'`, req.hostname, req.protocol) == -1) {
            return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
        }

        if (parseFloat(wallet) != 0) {
            if (await DataInsert(`tbl_transaction_customer`, `c_id, payment_id, amount, date, status, type`,
                `${uid}, '${rd[0].payment_id}', '${wallet}', '${fulldate.date}T${fulldate.time}', '2', '${insertid.insertId}'`, req.hostname, req.protocol) == -1) {
                return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
            }
        }

        if (await DataInsert(`tbl_transaction_driver`, `d_id, payment_id, amount, date, status, type`,
            `${rd[0].d_id}, '${insertid.insertId}', '${nwallet_amount}', '${fulldate.date}T${fulldate.time}', '1', ''`, req.hostname, req.protocol) == -1) {
            return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
        }

        // Chat
        const chat = await DataFind(`SELECT * FROM tbl_chat 
                                WHERE (sender_id = '${rd[0].c_id}' AND resiver_id = '${rd[0].d_id}') OR (sender_id = '${rd[0].d_id}' AND resiver_id = '${rd[0].c_id}')`);

        for (let i = 0; i < chat.length;) {
            const emessage = mysql.escape(chat[i].message);
            if (await DataInsert(`tbl_chat_save`, `sender_id, resiver_id, date, message`, `'${chat[i].sender_id}', '${chat[i].resiver_id}', '${chat[i].date}', ${emessage}`, req.hostname, req.protocol) == -1) {
                return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
            }
            i++
        }

        if (await DataDelete(`tbl_chat`, `(sender_id = '${rd[0].c_id}' AND resiver_id = '${rd[0].d_id}') OR (sender_id = '${rd[0].d_id}' AND resiver_id = '${rd[0].c_id}')`, req.hostname, req.protocol) == -1) {
            return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
        }

        const review_list = await DataFind(`SELECT * FROM tbl_ride_review_reason WHERE status = '1'`);
        
        console.log(111);
        
        return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Ride Complete Successful', request_id:insertid.insertId, review_list});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

router.post("/tbl_review", async(req, res)=>{
    try {
        const {uid, d_id, request_id, def_review, review, tot_star} = req.body;
        if(!uid || !d_id || !request_id || !tot_star) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong' });

        const rd = await DataFind(`SELECT * FROM tbl_order_vehicle WHERE id = '${request_id}' AND c_id = '${uid}' AND d_id = '${d_id}'`);
        if(rd == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Request Not Found!'});

        const revi = await DataFind(`SELECT * FROM tbl_review_driver WHERE request_id = '${rd[0].id}' AND customer_id = '${uid}' AND driver_id = '${d_id}'`);
        if(revi != "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Review Found!'});

        let esreview = mysql.escape(review), fulldate = new Date().toISOString();
        if (await DataInsert(`tbl_review_driver`, `driver_id, customer_id, request_id, def_review, review, tot_star, date`,
            `'${d_id}', '${uid}', '${rd[0].id}', '${def_review}', ${esreview}, '${tot_star}', '${fulldate}'`, req.hostname, req.protocol) == -1) {
            return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
        }
        return res.status(200).json({ ResponseCode: 200, Result:true, message: "Review Add Successful"});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



// ============= All Service Reuqest ================ //

async function JsonConvert(idlist) {
    let d_id_list = []
    if (idlist) {
        if (typeof idlist == "string") {
            d_id_list = JSON.parse(idlist);
        } else d_id_list = idlist
    }
    return {d_id_list}
}

async function AllServiceData(status, where, tblname, field, otp) {
    let data = [];
    if (status == "1") {
        data  = await DataFind(`SELECT cv.id, cv.d_id, cv.price, cv.status, cv.bid_addjust_amount, cv.km_charge, cv.extra_charge, cv.extra_person_charge, cv.day_charge, cv.rent_hour, cv.rental_hour_charge, 
                                cv.rental_per_hour_discount, cv.rental_extra_km, cv.rental_extra_km_charge, cv.tot_kg, cv.kg_charge, cv.tot_hour, cv.tot_minute, 
                                cv.status_time_location, cv.pic_lat_long, cv.drop_lat_long, cv.pic_address, cv.drop_address, cv.m_role, 
                                CASE
                                    WHEN cv.m_role = '1' THEN 'Vehicle'
                                    ELSE (
                                        SELECT name 
                                        FROM tbl_module_setting 
                                        WHERE (
                                            (cv.m_role = '2' AND id = 1) OR (cv.m_role = '3' AND id = 2) OR (cv.m_role = '4' AND id = 3)
                                        ) 
                                        LIMIT 1
                                    )
                                END AS mode_title,
                                COALESCE(vd.name, '') AS vehicle_name, COALESCE(pd.name, '') AS p_name
                                FROM ${tblname} AS cv
                                JOIN tbl_payment_detail AS pd ON cv.payment_id = pd.id
                                JOIN tbl_vehicle AS vd ON cv.vehicleid = vd.id
                                ${where} ORDER BY id DESC`);
    } else {
        let dr = await AllFunction.DriverReview("cv");
        
        data  = await DataFind(`SELECT cv.id, cv.d_id, cv.price, cv.status, cv.price, cv.final_price, cv.paid_amount, cv.bid_addjust_amount, cv.coupon_amount, cv.addi_time_price, cv.platform_fee, 
                                cv.weather_price, cv.wallet_price, cv.km_charge, cv.extra_charge, cv.extra_person_charge, cv.day_charge, cv.rent_hour, cv.rental_addi_ride_time, 
                                cv.rental_addi_ride_charge, cv.rental_hour_charge, cv.rental_per_hour_discount, cv.rental_extra_km, cv.rental_extra_km_charge, cv.tot_kg, cv.kg_charge,
                                cv.additional_time, cv.tot_hour, cv.tot_minute, cv.coupon_id, cv.status_time_location, cv.pic_lat_long, cv.drop_lat_long, cv.pic_address, 
                                cv.drop_address, cv.m_role, 
                                CASE
                                    WHEN cv.m_role = '1' THEN 'Vehicle'
                                    ELSE (
                                        SELECT name 
                                        FROM tbl_module_setting 
                                        WHERE (
                                            (cv.m_role = '2' AND id = 1) OR (cv.m_role = '3' AND id = 2) OR (cv.m_role = '4' AND id = 3)
                                        ) 
                                        LIMIT 1
                                    )
                                END AS mode_title,
                                cv.current_run_time, COALESCE(vd.name, '') AS vehicle_name, COALESCE(pd.name, '') AS p_name, 
                                COALESCE(dr.profile_image, "") AS profile_image, COALESCE(dr.vehicle_image, "") AS vehicle_image, COALESCE(dr.first_name, "") AS first_name, 
                                COALESCE(dr.last_name, "") AS last_name, COALESCE(dr.primary_ccode, "") AS primary_ccode, COALESCE(dr.primary_phoneNo, "") AS primary_phoneNo, 
                                COALESCE(dr.language, "") AS language, COALESCE(dr.vehicle_number, "") AS vehicle_number, COALESCE(dr.car_color, "") AS car_color
                                ${dr.tot_review}, COALESCE(vd.comission_rate, '') AS comission_rate,
                                COALESCE(vd.comission_type, '') AS comission_type
                                ${dr.avgstar} ${field} ${otp}, COALESCE(dr.latitude, '') AS latitude, COALESCE(dr.longitude, '') AS longitude, COALESCE(vd.map_img, '') AS map_img
                                FROM ${tblname} AS cv
                                LEFT JOIN tbl_payment_detail AS pd ON cv.payment_id = pd.id
                                LEFT JOIN tbl_vehicle AS vd ON cv.vehicleid = vd.id
                                LEFT JOIN tbl_driver AS dr ON cv.d_id = dr.id
                                ${dr.table}
                                ${where} GROUP BY cv.id, vd.name, pd.name, dr.id ORDER BY id DESC`);
    }
    return data
}


// km_charge, extra_charge, extra_person_charge, day_charge, rent_hour, rental_addi_ride_time, rental_addi_ride_charge, rental_hour_charge, rental_per_hour_discount, rental_extra_km,
// rental_extra_km_charge, tot_kg, kg_charge

// c_id, d_id, vehicleid, bidding_d_price, bidding_status, bidd_auto_status, status, m_role, price, paid_amount, km_charge, 
// extra_charge, weather_charge, platform_fee, extra_person_charge, day_charge, rent_hour, rental_hour_charge, rental_per_hour_discount, rental_extra_km, rental_extra_km_charge, 
// tot_kg, kg_charge, coupon_id, coupon_price, payment_id, tot_km, tot_hour, tot_minute, package_details, zone, status_time_location, start_time, pic_lat_long, drop_lat_long, pic_address, 
// drop_address, outs_category_id, mod_cate_id, num_passenger, book_date, book_time

router.post("/all_service_request", async(req, res)=>{
    try {
        const {uid, status} = req.body;
        if(!uid) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong' });

        const customer = await DataFind(`SELECT * FROM tbl_customer WHERE id = '${uid}'`);
        if(customer == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Customer Not Found!' });
        
        const general = await DataFind(`SELECT driver_wait_time FROM tbl_general_settings`);
        if(general == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong' });

        let Reuqest_list = [], totrequest = [];

        if (status == "upcoming") {
            let pen_req_request  = await AllServiceData(1, `WHERE cv.c_id = '${uid}'`, `tbl_request_vehicle`, 0);

            let first_list = pen_req_request.map(async(val) => {
                let idlist = await JsonConvert(val.d_id);
                val.driver_id_list = idlist ? idlist.d_id_list : []; val.d_id = "0";

                let otherdata = { "final_price": 0, "paid_amount": 0, "coupon_amount": 0, "addi_time_price": 0, "platform_fee": 0, "weather_price": 0, "wallet_price": 0, 
                "additional_time": 0, "coupon_id": "", "rental_addi_ride_time": 0, "rental_addi_ride_charge": 0, "current_run_time": "", "profile_image": "", "vehicle_image": "", 
                "first_name": "", "last_name": "", "primary_ccode": "", "primary_phoneNo": "", "language": "", "vehicle_number": "", "car_color": "", "tot_review": 0, 
                "comission_rate": "", "comission_type": "", "avg_star": 0.0, "otp": "", "latitude": "", "longitude": "", "map_img": ""}
                val = { ...val, ...otherdata};
                return val;
            });
            let flist = await Promise.all(first_list);

            let pen_card_request = await AllServiceData(2, `WHERE cv.c_id = '${uid}'`, `tbl_cart_vehicle`, ', cv.driver_id_list', ', cv.otp');

            let secound_list = pen_card_request.map(async(val) => {
                let idlist = await JsonConvert(val.driver_id_list);
                val.driver_id_list = idlist ? idlist.d_id_list : [];
                return val;
            })
            let slist = await Promise.all(secound_list);
            
            totrequest = flist.concat(slist);

        } else if (status == "completed") totrequest = await AllServiceData(2, `WHERE cv.c_id = '${uid}' AND cv.status = '8'`, `tbl_order_vehicle`, '', '');
        else if (status == "cancelled") totrequest = await AllServiceData(2, `WHERE cv.c_id = '${uid}' AND cv.status = '4'`, `tbl_order_vehicle`, '', '');

        if (status == "completed" || status == "cancelled") {
            let com_list = totrequest.map(async(val) => {
                val.driver_id_list = []; val.otp = "";
                return val
            })
            let slist = await Promise.all(com_list);
            totrequest = slist
        }

        if (totrequest != "") {
            Reuqest_list = await AllFunction.AllVehicleFormate(totrequest, 1);
            
            return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Data Load Successful', driver_wait_time: parseFloat(general[0].driver_wait_time), Reuqest_list:Reuqest_list});                 
        } else {
            return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Request Not Found!', driver_wait_time: parseFloat(general[0].driver_wait_time), Reuqest_list:[]});              
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


//const { checkedit } = require("../public/js/editor/ckeditor/adapters/check");

router.get("/ride_check", async(req, res)=>{
    try {
        // let date = await checkedit()
        // if (date.c == "1") return res.status(200).json({ ResponseCode: 200, Result: true, message: 'Project delete successful', Successful: date.a, Error:date.b });
        // else return res.status(200).json({ ResponseCode: 401, Result: false, message: 'Project delete Unsuccessful!', Error: date.c });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error', error});
    }
});

// ============= All Ride Detail ================ //

router.post("/all_ride_detail", async(req, res)=>{
    try {
        const {uid, request_id, status} = req.body;
        if(!uid || !request_id || !status) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong' });
        let Reuqest_list = [], review_check = 0;

        if (status == "complete") {

            // km_charge, extra_charge, extra_person_charge, day_charge, rent_hour, rental_addi_ride_time, rental_addi_ride_charge, rental_hour_charge, rental_per_hour_discount, 
            // rental_extra_km,
            // rental_extra_km_charge, tot_kg, kg_charge    // g v p s
            

            // c_id, d_id, vehicleid, bidding_status, bidd_auto_status, status, m_role, paid_status, price, final_price, paid_amount, 
            //     km_charge, additional_time, addi_time_price, platform_fee, weather_price, coupon_id, coupon_amount, wallet_price, extra_charge, extra_person_charge, day_charge, rent_hour, 
            //     rental_addi_ride_time, rental_addi_ride_charge, rental_hour_charge, rental_per_hour_discount, rental_extra_km, rental_extra_km_charge, tot_kg, kg_charge, payment_id, 
            //     tot_km, tot_hour, tot_minute, package_details, zone, ride_status, start_time, end_time, drop_tot, drop_complete, current_run_time, status_time, status_time_location, 
            //     status_calculation, pic_lat_long, drop_lat_long, pic_address, drop_address, payment_img, cancel_reason, outs_category_id, mod_cate_id, num_passenger, book_date, 
            //     book_time, req_id

            let mapdata = await DataFind(`SELECT cv.id, cv.c_id, cv.d_id, cv.price, cv.final_price, cv.paid_amount, cv.bid_addjust_amount, cv.coupon_amount, cv.addi_time_price, 
                                            cv.platform_fee, cv.weather_price, cv.wallet_price, cv.additional_time, 
                                            
                                            cv.km_charge, cv.extra_charge, cv.extra_person_charge, cv.day_charge, cv.rent_hour, cv.rental_addi_ride_time, cv.rental_addi_ride_charge, 
                                            cv.rental_hour_charge, cv.rental_per_hour_discount, cv.rental_extra_km, cv.rental_extra_km_charge, cv.tot_kg, cv.kg_charge,

                                            cv.status, cv.tot_km, cv.tot_hour, cv.tot_minute, cv.status_time_location, cv.pic_lat_long, cv.drop_lat_long, 
                                            cv.pic_address, cv.drop_address, cv.m_role, 
                                            CASE
                                                WHEN cv.m_role = '1' THEN 'Vehicle'
                                                ELSE (
                                                    SELECT name 
                                                    FROM tbl_module_setting
                                                    WHERE (
                                                        (cv.m_role = '2' AND id = 1) OR (cv.m_role = '3' AND id = 2) OR (cv.m_role = '4' AND id = 3)
                                                    )
                                                    LIMIT 1
                                                )
                                            END AS mode_title,
                                            cv.coupon_id, COALESCE(vd.name, '') AS vehicle_name, COALESCE(vd.comission_rate, '') AS comission_rate, 
                                            COALESCE(vd.comission_type, '') AS comission_type, COALESCE(dr.profile_image, '') AS profile_image, 
                                            COALESCE(pd.image, '') AS p_image, COALESCE(pd.name, '') AS p_name, 
                                            CASE WHEN COUNT(revi.id) > 0 THEN '1' ELSE '0' END AS review_check
                                            FROM tbl_order_vehicle AS cv
                                            LEFT JOIN tbl_driver AS dr ON cv.d_id = dr.id
                                            LEFT JOIN tbl_payment_detail AS pd ON cv.payment_id = pd.id
                                            LEFT JOIN tbl_vehicle AS vd ON cv.vehicleid = vd.id
                                            LEFT JOIN tbl_review_driver AS revi ON cv.d_id = revi.driver_id AND cv.c_id = revi.customer_id AND cv.id = revi.request_id
                                            WHERE cv.id = '${request_id}' AND cv.c_id = '${uid}' AND cv.status NOT IN ('4')
                                            GROUP BY cv.id ORDER BY cv.id DESC;`);
                
            if (mapdata != "") {
                const review = await DataFind(`SELECT * FROM tbl_review_driver WHERE request_id = '${mapdata[0].id}' AND driver_id = '${mapdata[0].d_id}' 
                                                AND customer_id = '${mapdata[0].c_id}'`);

                if (review != "") review_check = 1;
                mapdata[0].c_title = ""; mapdata[0].addi_time = parseFloat(mapdata[0].additional_time);

                mapdata[0].price = parseFloat(mapdata[0].price); mapdata[0].tot_km = parseFloat(mapdata[0].tot_km); mapdata[0].review_check = review_check; mapdata[0].review_check = review_check;
                Reuqest_list = await AllFunction.AllVehicleFormate(mapdata, 2);
    
                delete Reuqest_list[0].tot_drop; delete Reuqest_list[0].comission_rate; delete Reuqest_list[0].comission_type; delete Reuqest_list[0].additional_time;
                return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Data Load Successful', Reuqest_list: Reuqest_list[0]});                 
            } else {
                return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Request Not Found!', Reuqest_list: []});                
            }
        }

        if (status == "cancel") {
            let mapdata = await DataFind(`SELECT cv.id, cv.c_id, cv.d_id, cv.price, cv.final_price, cv.paid_amount, cv.bid_addjust_amount, cv.coupon_amount, cv.addi_time_price, 
                                            cv.platform_fee, cv.weather_price, cv.wallet_price, cv.additional_time, 

                                            cv.km_charge, cv.extra_charge, cv.extra_person_charge, cv.day_charge, cv.rent_hour, cv.rental_addi_ride_time, cv.rental_addi_ride_charge, 
                                            cv.rental_hour_charge, cv.rental_per_hour_discount, cv.rental_extra_km, cv.rental_extra_km_charge, cv.tot_kg, cv.kg_charge,

                                            cv.status, cv.tot_km, cv.tot_hour, cv.tot_minute, cv.status_time_location, cv.pic_lat_long, cv.drop_lat_long, cv.pic_address, 
                                            cv.drop_address, cv.m_role, 
                                            CASE
                                                WHEN cv.m_role = '1' THEN 'Vehicle'
                                                ELSE (
                                                    SELECT name 
                                                    FROM tbl_module_setting 
                                                    WHERE (
                                                        (cv.m_role = '2' AND id = 1) OR (cv.m_role = '3' AND id = 2) OR (cv.m_role = '4' AND id = 3)
                                                    ) 
                                                    LIMIT 1
                                                )
                                            END AS mode_title,
                                            cv.coupon_id, COALESCE(vd.name, '') AS vehicle_name, COALESCE(vd.comission_rate, '') AS comission_rate, 
                                            COALESCE(vd.comission_type, '') AS comission_type, COALESCE(pd.image, '') AS p_image, COALESCE(pd.name, '') AS p_name, 
                                            COALESCE(rcr.title, '') AS c_title, CASE WHEN COUNT(revi.id) > 0 THEN '1' ELSE '0' END AS review_check
                                            FROM tbl_order_vehicle AS cv
                                            LEFT JOIN tbl_payment_detail AS pd ON cv.payment_id = pd.id
                                            LEFT JOIN tbl_vehicle AS vd ON cv.vehicleid = vd.id
                                            LEFT JOIN tbl_ride_cancel_reason AS rcr ON cv.cancel_reason = rcr.id
                                            LEFT JOIN tbl_review_driver AS revi ON cv.d_id = revi.driver_id AND cv.c_id = revi.customer_id AND cv.id = revi.request_id
                                            WHERE cv.id = '${request_id}' AND cv.c_id = '${uid}' AND cv.status IN ('4') GROUP BY cv.id ORDER BY id DESC`);
            
            if (mapdata != "") {
                mapdata[0].price = parseFloat(mapdata[0].price); mapdata[0].tot_km = parseFloat(mapdata[0].tot_km); mapdata[0].addi_time = parseFloat(mapdata[0].additional_time);
                
                mapdata[0].review_check = review_check;
                Reuqest_list = await AllFunction.AllVehicleFormate(mapdata, 2);
    
                delete Reuqest_list[0].tot_drop; delete Reuqest_list[0].comission_rate; delete Reuqest_list[0].comission_type; delete Reuqest_list[0].additional_time;
                return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Data Load Successful', Reuqest_list:Reuqest_list[0]});                 
            } else {
                return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Request Not Found!', Reuqest_list:[]});             
            }
        }
        return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Request Not Found!', Reuqest_list:[]});     
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post("/ride_additional_detail", async(req, res)=>{
    try {
        const {uid, request_id, status} = req.body;
        if(!uid || !request_id || !status) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong' });
        // status = 1 running ride, 2 - ride details
        let check = await DataFind(`SELECT id, m_role, book_date, book_time, num_passenger, rent_hour, tot_kg, package_details FROM
                                    ${ status == 1 ? 'tbl_cart_vehicle' : 'tbl_order_vehicle' }
                                    WHERE (id = '${request_id}' OR req_id = '${request_id}') AND c_id = '${uid}'`);
        if (check == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Request Not Found!' });
        check[0].package_details = typeof check[0].package_details == "string" ? JSON.parse(check[0].package_details) : check[0].package_details;
        return res.status(200).json({ ResponseCode: 200, Result:true, message: "Data load successfully", add_data: check.length > 0 ? check[0] : {} });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})



// ============= Coupon and Payment ================ //

router.get("/coupon_payment", async(req, res)=>{
    try {
        let fulldate = await AllFunction.TodatDate();
        let coupon_list = await DataFind(`SELECT * FROM tbl_coupon WHERE start_date <= '${fulldate.date}' AND end_date >= '${fulldate.date}'`);
        coupon_list.map(cval => {
            let st = new Date(cval.start_date).toISOString().split("T");
            cval.start_date = `${st[0]} ${st[1]}`;

            let en = new Date(cval.end_date).toISOString().split("T");
            cval.end_date = `${en[0]} ${en[1]}`;
        });
        
        let payment_list = await DataFind(`SELECT * FROM tbl_payment_detail`);

        let spldata = payment_list[10].attribute.split(",");
        let bank_data = [ {bank_name: spldata[0]}, {holder_name: spldata[1]}, {account_no: spldata[2]}, {iafc_code: spldata[3]}, {swift_code: spldata[4]} ];

        const general = await DataFind(`SELECT default_payment FROM tbl_general_settings`);

        return res.status(200).json({ ResponseCode: 200, Result:true, message: "Data Load successful", default_payment:general[0].default_payment, coupon_list, payment_list, bank_data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
}) 

// ============= Module all data ================ //

router.post("/all_data", async(req, res)=>{
    try {
        const { mrole } = req.body;
        
        if(mrole == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});

        let module_data = []
        if (mrole == "2") module_data = await DataFind(`SELECT * FROM tbl_outstation WHERE status = 1`);

        if (mrole == "3") module_data = await DataFind(`SELECT * FROM tbl_rental WHERE status = 1`);

        if (mrole == "4") module_data = await DataFind(`SELECT * FROM tbl_package`);

        if (module_data != "") return res.status(200).json({ ResponseCode: 200, Result:true, message: "Data Load successful", module_data });
        else return res.status(200).json({ ResponseCode: 401, Result:false, message: "Data not find", module_data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
}) 

// ============= Module data ================ //

router.post("/module_data", async(req, res)=>{
    try {
        const {mid, mrole} = req.body;
        
        if(mid == "" || mrole == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});

        let module_data = []
        if (mrole == "2") module_data = await DataFind(`SELECT * FROM tbl_outstation WHERE status = 1 AND id = '${mid}'`);

        if (mrole == "3") module_data = await DataFind(`SELECT * FROM tbl_rental WHERE status = 1 AND id = '${mid}'`);

        if (mrole == "4") module_data = await DataFind(`SELECT * FROM tbl_package`);

        if (module_data != "") return res.status(200).json({ ResponseCode: 200, Result:true, message: "Data Load successful", module_data });
        else return res.status(200).json({ ResponseCode: 401, Result:false, message: "Data not find", module_data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// ============= Add Wallet ================ //

router.post("/add_wallet", async(req, res)=>{
    try {
        const {uid, payment_id, amount} = req.body;
        
        const missingField = await AllFunction.CheckBodyData(req, ["uid", "payment_id", "amount"]);   
        if(missingField) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});

        let customer = await DataFind(`SELECT * FROM tbl_customer WHERE status = 1 AND id = '${uid}'`);
        if(customer == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Customer not found!'});

        let fulldate = await AllFunction.TodatDate();

        if (await DataInsert(`tbl_transaction_customer`, `c_id, payment_id, amount, date, status, type`,
            `${uid}, '${payment_id}', '${amount}', '${fulldate.date}T${fulldate.time}', '1', ''`, req.hostname, req.protocol) == -1) {
            return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
        }

        let cdata = customer[0].wallet, wamount = 0
        if (cdata || cdata != "0" || cdata != "NaN") wamount = cdata;

        let wallet_amount = parseFloat(wamount) + parseFloat(amount)

        if (await DataUpdate(`tbl_customer`,` wallet = '${wallet_amount}'`, `id = '${uid}'`, req.hostname, req.protocol) == -1) {
            return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
        }

        return res.status(200).json({ ResponseCode: 200, Result:true, message: "Wallet Add successful" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// ============= Wallet Data ================ //

router.post("/wallet", async(req, res)=>{
    try {
        const {uid} = req.body;
        if(!uid) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});

        const customer = await DataFind(`SELECT * FROM tbl_customer WHERE status = 1 AND id = '${uid}'`);
        if(customer == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Customer not found!'});

        let wallet_data = await DataFind(`SELECT dt.*, COALESCE(pd.name, '') AS pname
                                        FROM tbl_transaction_customer AS dt
                                        LEFT JOIN tbl_payment_detail AS pd ON dt.payment_id = pd.id
                                        WHERE dt.c_id = '${uid}' AND wallet_status = '1'`);

        let wdata =  wallet_data.map(async(wval) => {
            const date = new Date(wval.date);
            const formattedDate = date.toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
            wval.date = formattedDate;
            if (wval.payment_id == "0") wval.pname = "Referred"
            return wval;
        });
        let fulldata = await Promise.all(wdata);

        return res.status(200).json({ ResponseCode: 200, Result:true, message: "Wallet Add successful", wallet_amount:customer[0].wallet, wallet_data:fulldata });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// ============= FAQ Data ================ //

router.get("/faq_data", async(req, res)=>{
    try {
        const faq_list = await DataFind(`SELECT * FROM tbl_list_faq`);

        return res.status(200).json({ ResponseCode: 200, Result:true, message: "Wallet Add successful", faq_list });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// ============= Pages Data ================ //

router.get("/pages_data", async(req, res)=>{
    try {
        const pages_list = await DataFind(`SELECT * FROM tbl_list_pages`);

        return res.status(200).json({ ResponseCode: 200, Result:true, message: "Pages load successfully", pages_list });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// ============= Refer And Earn Data ================ // 

router.post("/refer_and_earn", async(req, res)=>{
    try {
        const {uid} = req.body;
        if(!uid) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});

        const customer = await DataFind(`SELECT id, referral_code FROM tbl_customer WHERE id = '${uid}'`);
        const general = await DataFind(`SELECT refer_credit, signup_credit FROM tbl_general_settings`);

        if (customer != "" || general != "") {
            let refer_data = { referral_code:customer[0].referral_code, refer_credit:general[0].refer_credit, signup_credit:general[0].signup_credit }
            return res.status(200).json({ ResponseCode: 200, Result:true, message: "Data Load successful", refer_data });
        } else return res.status(200).json({ ResponseCode: 200, Result:true, message: "Data Not Found!", refer_data: {referral_code: "", refer_credit: "", signup_credit: ""}});

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// ============= Notification Data ================ // 

router.post("/notification", async(req, res)=>{
    try {
        const {uid} = req.body;
        if(!uid) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});

        const ndata = await DataFind(`SELECT noti.id, noti.image, noti.title, noti.description, noti.date
                                        FROM tbl_send_notification AS noti
                                        LEFT JOIN tbl_customer AS cus ON noti.customer = cus.id
                                        WHERE noti.customer = 'All' OR cus.id = '${uid}' ORDER BY noti.id DESC`);

        ndata.map(val => {
            const date = new Date(val.date);
            const formattedDate = date.toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
            val.date = formattedDate;
            return val;
        });
        
        return res.status(200).json({ ResponseCode: 200, Result:true, message: "Data Not Found!", ndata});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// ============= Account Deactive ================ // 

router.post("/account_deactive", async(req, res)=>{
    try {
        const {id} = req.body;

        const driver_list = await DataFind(`SELECT id FROM tbl_customer WHERE id = '${id}'`);      
        if (driver_list == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'ID Not Found!'});

        if (await DataUpdate(`tbl_customer`, `status = '0'`, `id = '${id}'`, req.hostname, req.protocol) == -1) {
    
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }
        
        return res.status(200).json({ ResponseCode: 200, Result:true, message: "Account Deactivate Successful" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
})






module.exports = router;