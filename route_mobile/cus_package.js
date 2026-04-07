/* jshint esversion: 6 */
/* jshint esversion: 8 */
/* jshint node: true */



const express = require("express");
const router = express.Router();
const fs = require('fs-extra');
const path = require("path");
const multer  = require('multer');
const mysql = require("mysql2");
const bcrypt = require('bcrypt');
const axios = require('axios');
const geolib = require('geolib');
const AllFunction = require("../route_function/function");
const sendOneNotification = require("../middleware/send");
const { DataFind, DataInsert, DataUpdate, DataDelete } = require("../middleware/databse_query");



router.get("/package_detail", async(req, res)=>{
    try {
        const category = await DataFind(`SELECT id, image, name, sub_title, length, weight, height, num_of_kg, bidding, minimum_fare, maximum_fare FROM tbl_package ORDER BY id DESC;`);

        return res.status(200).json({ ResponseCode: 200, Result: true, message: 'Detail load successfully', category});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post("/package_vehicle_list", async(req, res)=>{
    try {
        const { package_id } = req.body;

        const missingField = await AllFunction.BodyDataCheck(["package_id"], req.body);
        if (missingField.status == false) return res.status(200).json({ ResponseCode: 401, Result:false, message: missingField.message });
        
        const package = await DataFind(`SELECT id, vehicle FROM tbl_package WHERE id = '${package_id}' ORDER BY id DESC;`);
        if (package == '') return res.status(200).json({ ResponseCode: 401, Result:false, message: "Data Not Found!" });

        const vehicleIds = typeof package[0].vehicle == "string" ? JSON.parse(package[0].vehicle) : package[0].vehicle;
        const vehicle = await DataFind(`SELECT id, image, name, description, passenger_capacity FROM tbl_vehicle WHERE id IN (${vehicleIds.join(",")}) AND status = '1'`);
        
        return res.status(200).json({ ResponseCode: 200, Result: true, message: 'Detail load successfully', vehicle});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post("/package_fare_calculate", async(req, res)=>{
    try {
        const { package_id, tot_kg, pickup_lat_lon, drop_lat_lon, drop_lat_lon_list } = req.body;

        const missingField = await AllFunction.BodyDataCheck(["package_id", "tot_kg", "pickup_lat_lon", "drop_lat_lon", "drop_lat_lon_list"], req.body);
        if (missingField.status == false) return res.status(200).json({ ResponseCode: 401, Result:false, message: missingField.message });

        let package = await DataFind(`SELECT * FROM tbl_package WHERE status = '1' AND id = '${package_id}'`);
        if(package == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Ride details Not Found!'});

        if (package[0].num_of_kg < Number(tot_kg)) return res.status(200).json({ ResponseCode: 401, Result: false, 
            message: `Maximum parcel weight allowed is ${package[0].num_of_kg} kg. Please reduce your parcel weight to proceed.`});
        
        let convertzone = await AllFunction.ZoneLatlon(pickup_lat_lon, drop_lat_lon, drop_lat_lon_list);
        let zonecheck = await AllFunction.CheckZone(convertzone);

        const general = await DataFind(`SELECT id, pack_offer_exprie_time_cus, google_map_key, site_currency, weather_price, weather_type, package FROM tbl_general_settings`);
        if(general == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});
        if(general[0].package == 0) {
            let ms = await DataFind(`SELECT id, name FROM tbl_module_setting`);
            return res.status(200).json({ ResponseCode: 401, Result:false, message: `${ms[2].name} Service temporarily unavailable`});
        }

        if (zonecheck[1].zc != 0) return res.status(200).json({ ResponseCode: 401, Result: false, message: 'Address is not in the zone!'});
        let zoneresult = zonecheck[0].zr;

        let cal = 0, totmin = 0;
        
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
         
        if (cal == "0") return res.status(200).json({ ResponseCode: 401, Result: false, message: 'Fare Not Calculate'});

        if (package[0].up_to_km > Number(cal)) return res.status(200).json({ ResponseCode: 401, Result: false, 
            message: `Minimum ride distance is ${package[0].up_to_km} km. Please increase your trip distance to proceed.`});

        let tot_price = 0, km_charge = 0, kg_charge = 0, extra_charge = 0, weather_charge = 0, site_commission = 0;

        const totkmcharge = Number((cal * package[0].up_to_fee).toFixed(2));
        tot_price += totkmcharge; km_charge = totkmcharge

        if (Number(package[0].per_kg_price) > 0) {
            const totkgc = Number((Number(tot_kg) * package[0].per_kg_price).toFixed(2));
            tot_price += totkgc; kg_charge = totkgc;
        }

        if (Number(package[0].extra_charge) > 0) {
            tot_price = tot_price + Number(package[0].extra_charge);
            extra_charge = Number(package[0].extra_charge);
        }

        if (general[0].weather_type == 'fix') {
            tot_price = tot_price + Number(general[0].weather_price);
            weather_charge = Number(general[0].weather_price);
        } else {
            const weatherp = Number(((tot_price / 100) * Number(general[0].weather_price)).toFixed(2));
            tot_price = tot_price + weatherp; weather_charge = weatherp;
        }

        if (package[0].comission_type == 'fix') {
            tot_price = tot_price + Number(package[0].comission_rate);
            site_commission = Number(package[0].comission_rate);
        } else {
            const scom = Number(((tot_price / 100) * Number(package[0].comission_rate)).toFixed(2));
            tot_price = tot_price + scom; site_commission = scom;
        }
        
        let hou_min = await AllFunction.MinuteToHour(totmin), dr_price = Number((tot_price).toFixed(2));
        
        if (package[0].bidding == 0) {
            return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Fare calculate successful', offer_expire_time: general[0].pack_offer_exprie_time_cus, zoneresult,
                zone: zonecheck[2].zid, tot_km:Number(Number(cal).toFixed(2)), tot_hour: hou_min.hour, tot_minute: hou_min.minute, tot_price:dr_price, km_charge, 
                kg_charge, extra_charge, weather_charge, site_commission });

        } else {
            
            if (Number(package[0].minimum_fare) > Number(tot_price)) {
    
                return res.status(200).json({ ResponseCode: 401, Result: false, message: `The fare in this city exceeds our minimum limit of ${general[0].site_currency}${package[0].minimum_fare}.` });
    
            } else if (Number(package[0].maximum_fare) < Number(tot_price)) {
    
                return res.status(200).json({ ResponseCode: 401, Result: false, message: `The fare in this city exceeds our maximum limit of ${general[0].site_currency}${package[0].maximum_fare}.` });
    
            } else {
    
                return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Fare calculate successful', offer_expire_time: general[0].pack_offer_exprie_time_cus, 
                zoneresult, zone: zonecheck[2].zid, tot_km:Number(Number(cal).toFixed(2)), tot_hour: hou_min.hour, tot_minute: hou_min.minute, tot_price:dr_price, km_charge, 
                kg_charge, extra_charge, weather_charge, site_commission });
            }
        }
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

async function UploadImage(base64String) {
    try {

        let basepath = '';
        const signatures = [
            { prefix: 'iVBORw0KGgo', mime: 'image/png' },
            { prefix: '/9j/', mime: 'image/jpeg' },
            { prefix: 'R0lGODdh', mime: 'image/gif' },
            { prefix: 'R0lGODlh', mime: 'image/gif' },
            { prefix: 'Qk0', mime: 'image/bmp' },
            { prefix: 'SUkq', mime: 'image/tiff' },
            { prefix: 'AAABAA', mime: 'image/x-icon' },
            { prefix: 'JVBER', mime: 'application/pdf' },
            { prefix: 'UEsDB', mime: 'application/zip' },
            { prefix: 'UMFy', mime: 'application/x-rar-compressed' },
            { prefix: 'UklGR', mime: 'image/webp' },
            { prefix: 'RIFF', mime: 'image/webp' },
            { prefix: 'BM', mime: 'image/bmp' },
            { prefix: 'ACsp', mime: 'image/x-xbitmap' },
            { prefix: 'PD94bWwg', mime: 'image/svg+xml' },
        ];

        for (const { prefix, mime } of signatures) {
            if (base64String.startsWith(prefix)) {
                basepath = mime
            }
        }
        
        const imgSrc = `data:${basepath};base64,${base64String}`;

        const matches = imgSrc.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
        if (!matches) return res.status(400).json({ ResponseCode: 401, Result:false, message: 'Invalid base64' });
        
        const ext = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        
        let filename = ''
        filename = `${Date.now()}.${ext}`;
        const filePath = path.join(__dirname, '../public/uploads/package_order_images', filename);

        try {
            await fs.writeFileSync(filePath, buffer);

            // await fs.promises.writeFile(savePath, imageBuffer);
            // console.log('Image saved successfully:', filePath);
            return `uploads/package_order_images/${filename}`
        } catch (writeError) {
            // Handle any errors that occur while writing the file
            console.error("Error writing image to file:", writeError.message);
            return false;
        }
        
    } catch (error) {
        console.error("Error saving image:", error);
        throw error;
    }
}

router.post("/package_send_request", async(req, res)=>{
    try {
        let { uid, package_id, book_date, book_time, tot_km, tot_hour, tot_minute, tot_price, bid_addjust_amount, km_charge, extra_charge, weather_charge, tot_kg, kg_charge, 
                site_commission, payment_id, coupon_id, bidd_status, bidd_auto_status, zone, pickup_lat_lon, drop_lat_lon, drop_lat_lon_list, pickupadd, dropadd, droplistadd, image, 
                sender_number, reciver_number, length, weight, height, what_a_driver
        } = req.body;

        const missingField = await AllFunction.BodyNumberDataCheck(["uid", "package_id", "book_date", "book_time", "tot_km", "tot_hour", "tot_minute", "tot_price", "bid_addjust_amount", 
            "extra_charge", "weather_charge", "km_charge", "tot_kg", "kg_charge", "site_commission", "bidd_status", "bidd_auto_status", "zone", "pickup_lat_lon", 
            "drop_lat_lon", "pickupadd", "dropadd"], req.body);
        if (missingField.status == false) return res.status(200).json({ ResponseCode: 401, Result:false, message: missingField.message });


        const package = await DataFind(`SELECT * FROM tbl_package WHERE status = '1' AND id = '${package_id}'`);
        if(package == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Ride details Not Found!'});

        const general = await DataFind(`SELECT id, vehicle_radius, default_payment, package FROM tbl_general_settings`);
        // console.log(general);
        if(general == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});
        if(general[0].package == 0) {
            let ms = await DataFind(`SELECT id, name FROM tbl_module_setting`);
            return res.status(200).json({ ResponseCode: 401, Result:false, message: `${ms[2].name} Service temporarily unavailable`});
        }

        let payment = payment_id == "0" ? general[0].default_payment : payment_id;
        
        let picklalo = pickup_lat_lon != '' ? pickup_lat_lon.split(",") : [], coupon_price = 0, driver = [];
        // console.log(picklalo);
        
        const vlist = typeof package[0].vehicle == "string" ? JSON.parse(package[0].vehicle) : package[0].vehicle;
        if (picklalo.length > 0) {
            driver = await AllFunction.AvailableDriverGet(Number(picklalo[0]), Number(picklalo[1]), Number(package[0].radius_km), `vehicle IN (${vlist.join(",")})`, zone, 4);
            
        } else return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Pickup location data not found!'});
        
        console.log(driver);
        
        if (driver.status == false) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'No drivers found nearby. Please try again shortly.!'});
        // let convertzone = await AllFunction.ZoneLatlon(pickup_lat_lon, drop_lat_lon, drop_lat_lon_list), latlonadd = [];

       

        let convertz = await AllFunction.ZoneLatlon(pickup_lat_lon, drop_lat_lon, drop_lat_lon_list), pic = "", dropdata = "", picadd = "", dropad ="", id = 0, alcount = 0, drocount = 2;
        
        for (let i = 0; i < convertz.length;) {
            if (i == "0") pic = convertz[i].latitude + "&!" + convertz[i].longitude;
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

        // console.log(alcount);
        // console.log(drocount);
        
        if(alcount != drocount) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Location details are incomplete.'});

        if (coupon_id != '') {
            const cl = await DataFind(`SELECT * FROM tbl_coupon WHERE id = '${coupon_id}'`);
            if (cl.length > 0) {
                if (new Date(book_date) >= new Date(cl[0].start_date) || new Date(book_date) <= new Date(cl[0].end_date)) {
                    let totpc = tot_price - site_commission
                    if (totpc >= Number(cl[0].min_amount)) {
                        tot_price -= Number(cl[0].discount_amount); coupon_price = Number(cl[0].discount_amount);
                    }
                } else return res.status(200).json({ ResponseCode: 401, Result: false, message: `Invalid coupon applied!` });
            } else return res.status(200).json({ ResponseCode: 401, Result: false, message: `Coupon not found!` });
        }
        
        let simages = [];
        for (let  i = 0; i < image.length;) {
            const img = await UploadImage(image[i]);
            if (img != false) simages.push(img);
            i++;
        }

        const package_details = [
            { sender_number, reciver_number, length, weight, height, what_a_driver, parcel: simages }
        ];
        
        let bidd_amount_dif = '', fnala = 0

        const dropa = Number(tot_price);
        const bidAdjust = Number(bid_addjust_amount);

        if (bidd_status == 1 && dropa !== bidAdjust) {
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
        
        indata = await DataInsert(`tbl_request_vehicle`, `c_id, d_id, vehicleid, bidding_d_price, bidding_status, bidd_auto_status, status, m_role, price, paid_amount, bid_addjust_amount, 
            km_charge, extra_charge, weather_charge, platform_fee, extra_person_charge, day_charge, rent_hour, rental_hour_charge, rental_per_hour_discount, rental_extra_km, 
            rental_extra_km_charge, tot_kg, kg_charge, coupon_id, coupon_price, payment_id, tot_km, tot_hour, tot_minute, package_details, zone, status_time_location, start_time, 
            pic_lat_long, drop_lat_long, pic_address, drop_address, outs_category_id, mod_cate_id, num_passenger, book_date, book_time`,
            `'${uid}', '${JSON.stringify(driver.idlist)}', '${vlist.join(",")}', '', '${bidd_status}', '${bidd_auto_status == 'true' ? 1 : 0}', '0', '4', 
            '${bid_addjust_amount == '0' ? tot_price : bid_addjust_amount}', '0', '${bidd_amount_dif}', '${km_charge}', '${extra_charge}', '${weather_charge}', '${site_commission}', 
            '0', '0', '0', '0', '0', '0', '0', '${tot_kg}', '${kg_charge}', '${coupon_id}', 
            '${coupon_price}', '${payment}', '${tot_km}', '${tot_hour}', '${tot_minute}', '${JSON.stringify(package_details)}', '${JSON.stringify(zone)}', '', 
            '${new Date().toISOString()}', '${pic}','${dropdata}', ${mysql.escape(picadd)}, ${mysql.escape(dropad)}, '', '${package_id}', '0', '${book_date}', 
            '${await AllFunction.convertTo12HourFormat(book_time)}'`, req.hostname, req.protocol);

        for (let  i = 0; i < driver.idlist.length; ) {
            sendOneNotification("New ride request received! Ready to go!", 'driver', driver.idlist[i]);
            i++;
        }

        return res.status(200).json({ ResponseCode: 200, Result:true, message: `We’ve sent ${driver.idlist.length} captain requests; they’ll confirm shortly.`, 
            request_id: indata.insertId, driver_id: driver.idlist });
        
        // return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Request add succesfully', driver_id: driver.idlist });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



module.exports = router;