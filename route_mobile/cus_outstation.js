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



router.get("/category_detail", async(req, res)=>{
    try {
        const category = await DataFind(`SELECT * FROM tbl_outstation_category ORDER BY id DESC;`);

        return res.status(200).json({ ResponseCode: 200, Result: true, message: 'Detail load successfully', category});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post("/category_detail", async(req, res)=>{
    try {
        const { cat_id } = req.body;

        const missingField = await AllFunction.BodyDataCheck(["cat_id"], req.body);
        if (missingField.status == false) return res.status(200).json({ ResponseCode: 401, Result:false, message: missingField.message });
        
        const outstation = await DataFind(`SELECT id, image, name, bidding, minimum_fare, maximum_fare FROM tbl_outstation_category WHERE outstation_category = '${cat_id}'  AND status = '1' ORDER BY id DESC;`);
        if (outstation == '') return res.status(200).json({ ResponseCode: 401, Result:false, message: "Data Not Found!" });

        return res.status(200).json({ ResponseCode: 200, Result: true, message: 'Detail load successfully', outstation});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post("/outstation_list", async(req, res)=>{
    try {
        const { cat_id } = req.body;

        const missingField = await AllFunction.BodyDataCheck(["cat_id"], req.body);
        if (missingField.status == false) return res.status(200).json({ ResponseCode: 401, Result:false, message: missingField.message });
        
        const outstation = await DataFind(`SELECT id, image, name, bidding, minimum_fare, maximum_fare, tot_passenger AS passenger_capacity FROM tbl_outstation WHERE outstation_category = '${cat_id}'  AND status = '1' ORDER BY id DESC;`);
        if (outstation == '') return res.status(200).json({ ResponseCode: 401, Result:false, message: "Data Not Found!" });

        return res.status(200).json({ ResponseCode: 200, Result: true, message: 'Detail load successfully', outstation});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post("/vehicle_list", async(req, res)=>{
    try {
        const { outs_id } = req.body;

        const missingField = await AllFunction.BodyDataCheck(["outs_id"], req.body);
        if (missingField.status == false) return res.status(200).json({ ResponseCode: 401, Result:false, message: missingField.message });

        const outstation = await DataFind(`SELECT id, vehicle FROM tbl_outstation WHERE id = '${outs_id}' ORDER BY id DESC;`);
        if (outstation == '') return res.status(200).json({ ResponseCode: 401, Result:false, message: "Data Not Found!" });

        const vehicleIds = typeof outstation[0].vehicle == "string" ? JSON.parse(outstation[0].vehicle) : outstation[0].vehicle;
        const vehicle = await DataFind(`SELECT id, image, name, description FROM tbl_vehicle WHERE id IN (${vehicleIds.join(",")}) AND status = '1'`);

        return res.status(200).json({ ResponseCode: 200, Result: true, message: 'Detail load successfully', vehicle});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post("/fare_calculate", async(req, res)=>{
    try {
        const { outs_id, vehicle_id, num_passenger, book_date, pickup_lat_lon, drop_lat_lon, drop_lat_lon_list } = req.body;

        const missingField = await AllFunction.BodyDataCheck(["outs_id", "vehicle_id", "num_passenger", "book_date", "pickup_lat_lon", "drop_lat_lon", "drop_lat_lon_list"], req.body);
        if (missingField.status == false) return res.status(200).json({ ResponseCode: 401, Result:false, message: missingField.message });

        let outsta = await DataFind(`SELECT * FROM tbl_outstation WHERE status = '1' AND id = '${outs_id}'`);
        if(outsta == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Ride details Not Found!'});

        let rcheck = typeof outsta[0].vehicle == "string" ? JSON.parse(outsta[0].vehicle) : outsta[0].vehicle;
        let checkv = rcheck.includes(Number(vehicle_id));
        if (checkv == false) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Invalid Ride!'});
        
        let convertzone = await AllFunction.ZoneLatlon(pickup_lat_lon, drop_lat_lon, drop_lat_lon_list);
        let zonecheck = await AllFunction.CheckZone(convertzone);

        const general = await DataFind(`SELECT id, out_offer_exprie_time_cus, google_map_key, site_currency, weather_price, weather_type, outstation FROM tbl_general_settings`);
        if(general == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});
        if(general[0].outstation == 0) {
            let ms = await DataFind(`SELECT id, name FROM tbl_module_setting`);
            return res.status(200).json({ ResponseCode: 401, Result:false, message: `${ms[0].name} Service temporarily unavailable`});
        }

        if (zonecheck[1].zc != 0) return res.status(200).json({ ResponseCode: 401, Result: false, message: 'Address is not in the zone!'});
        let zoneresult = zonecheck[0].zr;

        let cal = 0, totmin = 0;
        
        for (let c = 1; c < zoneresult.length;) {

            if (zoneresult[c].status == "1") {
                
                let pickup = `${convertzone[c-1].latitude},${convertzone[c-1].longitude}`;
                let drop = `${convertzone[c].latitude},${convertzone[c].longitude}`;
                let distance = await AllFunction.GetDistance(pickup, drop, general[0].google_map_key);

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

        let roundkm = Number(Number(cal).toFixed(2)), km_charge = 0, add_distance = 0, tot_price = 0, extra_charge = 0, weather_charge = 0, extra_person_charge = 0, day_charge = 0, site_commission = 0;
        
        if (roundkm <= outsta[0].min_km_distance) {
            
            tot_price = parseFloat(roundkm) * parseFloat(outsta[0].min_km_price);
        } else {
            add_distance = parseFloat(roundkm) - parseFloat(Number(outsta[0].min_km_distance));
            tot_price = (parseFloat(outsta[0].min_km_distance) * parseFloat(outsta[0].min_km_price) + (parseFloat(add_distance) * parseFloat(outsta[0].after_km_price)));
        }
        km_charge = tot_price;

        if (Number(outsta[0].extra_charge) > 0) {
            tot_price = tot_price + Number(outsta[0].extra_charge);
            extra_charge = Number(outsta[0].extra_charge);
        }
        
        if (outsta[0].tot_passenger > 0) {
            if (num_passenger <= outsta[0].tot_passenger) {
                const passp = Number((num_passenger * outsta[0].per_person_price).toFixed(2));
                tot_price = tot_price + passp; extra_person_charge = passp;
            } else return res.status(200).json({ ResponseCode: 401, Result:false, message: `Maximum passenger limit exceeded. Allowed: ${outsta[0].tot_passenger}`});
        }

        const datec = AllFunction.checkDateTypeinOut(book_date);
        if (datec < 0) return res.status(200).json({ ResponseCode: 401, Result:false, message: `Provided date is invalid`});
        // tot_price = datec == 1 ? tot_price + outsta[0].today_price : ( datec == 2 ? tot_price + outsta[0].tomorrow_price : ( datec == 3 ? tot_price + outsta[0].day_after_price : 0) );
        const dcharge = datec == 1 ? outsta[0].today_price : datec == 2 ? outsta[0].tomorrow_price: datec == 3 ? outsta[0].day_after_price : 0;
        tot_price += dcharge; day_charge = dcharge;

        if (general[0].weather_type == 'fix') {
            tot_price = tot_price + Number(general[0].weather_price);
            weather_charge = Number(general[0].weather_price);
        } else {
            const weatherp = Number(((tot_price / 100) * Number(general[0].weather_price)).toFixed(2));
            tot_price = tot_price + weatherp; weather_charge = weatherp
        }

        if (outsta[0].comission_type == 'fix') {
            tot_price = tot_price + Number(outsta[0].comission_rate);
            site_commission = Number(outsta[0].comission_rate);
        } else {
            const scom = Number(((tot_price / 100) * Number(outsta[0].comission_rate)).toFixed(2));
            tot_price = tot_price + scom; site_commission = scom;
        }

        let hou_min = await AllFunction.MinuteToHour(totmin), dr_price = Number((tot_price).toFixed(2));
        
        if (outsta[0].bidding == 0) {
            return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Fare calculate successful', offer_expire_time: general[0].out_offer_exprie_time_cus, zoneresult,
                zone: zonecheck[2].zid, tot_km: roundkm, tot_hour: hou_min.hour, tot_minute: hou_min.minute, tot_price:dr_price, km_charge, extra_charge, weather_charge, 
                extra_person_charge, day_charge, site_commission });

        } else {
            
            if (Number(outsta[0].minimum_fare) > Number(dr_price)) {
    
                return res.status(200).json({ ResponseCode: 401, Result: false, message: `The fare in this city exceeds our minimum limit of ${general[0].site_currency}${outsta[0].minimum_fare}.` });
    
            } else if (Number(outsta[0].maximum_fare) < Number(dr_price)) {
    
                return res.status(200).json({ ResponseCode: 401, Result: false, message: `The fare in this city exceeds our maximum limit of ${general[0].site_currency}${outsta[0].maximum_fare}.` });
    
            } else {
                
                return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Fare calculate successful', offer_expire_time: general[0].out_offer_exprie_time_cus, 
                zoneresult, zone: zonecheck[2].zid, tot_km: roundkm, tot_hour: hou_min.hour, tot_minute: hou_min.minute, tot_price:dr_price, km_charge, 
                extra_charge, weather_charge, extra_person_charge, day_charge, site_commission });
            }
        }
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



router.post("/send_request", async(req, res)=>{
    try {
        let { uid, outs_category_id, outs_id, vehicle_id, num_passenger, book_date, book_time, tot_km, tot_hour, tot_minute, tot_price, bid_addjust_amount, km_charge, extra_charge, 
            weather_charge, extra_person_charge, day_charge, site_commission, payment_id, coupon_id, bidd_status, bidd_auto_status, zone, pickup_lat_lon, drop_lat_lon, 
            drop_lat_lon_list, pickupadd, dropadd, droplistadd
        } = req.body;

        const missingField = await AllFunction.BodyNumberDataCheck(["uid", "outs_category_id", "outs_id", "vehicle_id", "num_passenger", "book_date", "book_time", "tot_km", "tot_hour", 
            "tot_minute", "tot_price", "bid_addjust_amount", "km_charge", "extra_charge", "weather_charge", "extra_person_charge", "day_charge", "site_commission", "bidd_status", 
            "bidd_auto_status", "zone", "pickup_lat_lon", "drop_lat_lon", "pickupadd", "dropadd"], req.body);
        if (missingField.status == false) return res.status(200).json({ ResponseCode: 401, Result:false, message: missingField.message });


        const general = await DataFind(`SELECT id, vehicle_radius, default_payment, outstation FROM tbl_general_settings`);
        
        if(general == "") return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Something went wrong'});
        if(general[0].outstation == 0) {
            let ms = await DataFind(`SELECT id, name FROM tbl_module_setting`);
            return res.status(200).json({ ResponseCode: 401, Result:false, message: `${ms[0].name} Service temporarily unavailable`});
        }
        let payment = payment_id == "0" ? general[0].default_payment : payment_id;
        
        let picklalo = pickup_lat_lon != '' ? pickup_lat_lon.split(",") : [], coupon_price = 0, driver = [];
        
        if (picklalo.length > 0) {
            driver = await AllFunction.AvailableDriverGet(Number(picklalo[0]), Number(picklalo[1]), general[0].vehicle_radius, `vehicle = '${vehicle_id}'`, zone, 2);
            
        } else return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Pickup location data not found!'});
        
        if (driver.status == false) return res.status(200).json({ ResponseCode: 401, Result:false, message: 'No drivers found nearby. Please try again shortly.!'});

        let convertz = await AllFunction.ZoneLatlon(pickup_lat_lon, drop_lat_lon, drop_lat_lon_list), pic = "", dropdata = "", picadd = "", dropad ="", id = 0, alcount = 0, drocount = 2;

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
            `'${uid}', '${JSON.stringify(driver.idlist)}', '${vehicle_id}', '', '${bidd_status}', '${bidd_auto_status == 'true' ? 1 : 0}', '0', '2', 
            '${bid_addjust_amount == '0' ? tot_price : bid_addjust_amount}', '0', '${bidd_amount_dif}', 
            '${km_charge}', '${extra_charge}', '${weather_charge}', '${site_commission}', '${extra_person_charge}', '${day_charge}', '0', '0', '0', '0', '0', '0', '0', '${coupon_id}', 
            '${coupon_price}', '${payment}', '${tot_km}', '${tot_hour}', '${tot_minute}', '[]', '${JSON.stringify(zone)}', '', '${new Date().toISOString()}', '${pic}', '${dropdata}', 
            ${mysql.escape(picadd)}, ${mysql.escape(dropad)}, '${outs_category_id}', '${outs_id}', '${num_passenger}', '${book_date}', 
            '${await AllFunction.convertTo12HourFormat(book_time)}'`, req.hostname, req.protocol);


        for (let  i = 0; i < driver.idlist.length; ) {
            sendOneNotification("New ride request received! Ready to go!", 'driver', driver.idlist[i]);
            i++;
        }

        return res.status(200).json({ ResponseCode: 200, Result:true, message: `We’ve sent ${driver.idlist.length} captain requests; they’ll confirm shortly.`, 
            request_id: indata.insertId, driver_id: driver.idlist });
        
        // return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Request add succesfully', driver_id: driver.idlist });
        // return res.status(200).json({ ResponseCode: 200, Result:true, message: 'Request add succesfully', driver_id: driver[0]?.driver_ids ?? [] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



module.exports = router;