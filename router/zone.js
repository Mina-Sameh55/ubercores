/* jshint esversion: 6 */
/* jshint esversion: 8 */
/* jshint node: true */



const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const multer  = require('multer');
const mysql = require("mysql2");
const { DataFind, DataInsert, DataUpdate, DataDelete } = require("../middleware/databse_query");



router.get("/list", auth, async(req, res)=>{
    try {
        const zone_data = await DataFind(`SELECT * FROM tbl_zone`);

        
        
        res.render("zone", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, zone_data
        })
    } catch (error) {
        console.log(error);
    }
})

router.post("/add_zone", auth, async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {name, status, zone_lat_lon} = req.body;

        const all_lat_lon = zone_lat_lon.split(',').map(Number);
        let zone_leg = all_lat_lon.length;

        
        
        let latitude = [], longitude = [], poly_lat = [], poly_long = [], lat_log = [], polygone = [];            

        for (let i = 0; i < zone_leg;) {

            if ((i%2) == 0) {
                latitude.push(all_lat_lon[i]);
                poly_long.push(all_lat_lon[i]);
            } else {
                longitude.push(all_lat_lon[i]);
                poly_lat.push(all_lat_lon[i]);
            }
            i++;
        }

        
        for (let a = 0; a < latitude.length;) {
            lat_log.push(`${latitude[a]}:${longitude[a]}`);
            polygone.push(`${poly_long[a]} ${poly_lat[a]}`);
            a++;
        }

        if (polygone[0] !== polygone[polygone.length - 1]) {
            polygone.push(polygone[0]);
        }
        const polygonWKT = `POLYGON((${polygone.join(', ')}))`;

        let zone = lat_log.toString();

        if (await DataInsert(`tbl_zone`, `name, status, lat_lon, lat_lon_polygon`, `'${name}', '${status}', '${zone}', ST_GeomFromText(${mysql.escape(polygonWKT)}, 4326)`, req.hostname, req.protocol) == -1) {
        
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }
        
        req.flash('success', 'Zone Add successfully');
        res.redirect("/zone/list");
    } catch (error) {
        console.log(error);
    }
})

router.get("/edit/:id", auth, async(req, res)=>{
    try {
        const zone_data = await DataFind(`SELECT * FROM tbl_zone where id = '${req.params.id}'`);

        res.render("edit_zone", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, zone_data
        })
    } catch (error) {
        console.log(error);
    }
})

router.post("/edit_zone", auth, async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {zone_id, name, status, zone_lat_lon} = req.body;

        console.log(req.body);

        const esname = mysql.escape(name)
        if (zone_lat_lon == "") {
            if (await DataUpdate(`tbl_zone`, `name = ${esname}, status = '${status}'`, `id = '${zone_id}'`, req.hostname, req.protocol) == -1) {
        
                req.flash('errors', process.env.dataerror);
                return res.redirect("/valid_license");
            }
            
        } else {

           



            const all_lat_lon = zone_lat_lon.split(',').map(Number);
            let zone_leg = all_lat_lon.length;

            console.log(all_lat_lon);
            
            let latitude = [], longitude = [], poly_lat = [], poly_long = [], lat_log = [], polygone = [];            

            for (let i = 0; i < zone_leg;) {

                if ((i%2) == 0) {
                    latitude.push(all_lat_lon[i]);
                    poly_long.push(all_lat_lon[i]);
                } else {
                    longitude.push(all_lat_lon[i]);
                    poly_lat.push(all_lat_lon[i]);
                }
                i++;
            }

            
            for (let a = 0; a < latitude.length;) {
                lat_log.push(`${latitude[a]}:${longitude[a]}`);
                polygone.push(`${poly_long[a]} ${poly_lat[a]}`);
                a++;
            }

            if (polygone[0] !== polygone[polygone.length - 1]) {
                polygone.push(polygone[0]);
            }
            const polygonWKT = `POLYGON((${polygone.join(', ')}))`;

            let zone = lat_log.toString();

            if (await DataUpdate(`tbl_zone`, `name = '${name}', status = '${status}', lat_lon = '${zone}', lat_lon_polygon = ST_GeomFromText(${mysql.escape(polygonWKT)}, 4326)`, 
                `id = '${zone_id}'`, req.hostname, req.protocol) == -1) {
        
                req.flash('errors', process.env.dataerror);
                return res.redirect("/valid_license");
            }
        }


        
        
        req.flash('success', 'Zone Updated successfully');
        res.redirect("/zone/list");
    } catch (error) {
        console.log(error);
    }
})

router.get("/delete/:id", auth, async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        if (await DataDelete(`tbl_zone`, `id = '${req.params.id}'`, req.hostname, req.protocol) == -1) {
        
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }
        
        req.flash('success', 'Zone Deleted successfully');
        res.redirect("/zone/list");
    } catch (error) {
        console.log(error);
    }
})


router.get("/live_driver", auth, async(req, res)=>{
    try {
        const zone_data = await DataFind(`SELECT * FROM tbl_zone`);
        const vehicle = await DataFind(`SELECT * FROM tbl_vehicle WHERE status = '1'`);

        res.render("zone_driver_location", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, zone_data, vehicle
        })
    } catch (error) {
        console.log(error);
    }
})

router.post("/change_location", auth, async(req, res)=>{
    try {
        const {zid, vid} = req.body;
        
        const zone_data = await DataFind(`SELECT * FROM tbl_zone ${ zid != "0" ? `WHERE id = '${zid}'` : '' }`);
        
        let dri = [], zdata = 0;
        if (zone_data != "") {
            dri = await DataFind(`SELECT dr.id, dr.vehicle, dr.first_name, dr.last_name, dr.latitude, dr.longitude, dr.primary_ccode, dr.primary_phoneNo, dr.secound_ccode,
                                    dr.secound_phoneNo, COALESCE(ve.map_img, '') AS image, COALESCE(ve.name, '') AS vehicle_name, COUNT(ord.id) AS tot_ride,
                                    COALESCE(GROUP_CONCAT(DISTINCT dz.name SEPARATOR ', '), '') AS zone_name
                                    FROM tbl_driver AS dr
                                    LEFT JOIN tbl_vehicle AS ve ON dr.vehicle = ve.id
                                    LEFT JOIN tbl_order_vehicle AS ord ON dr.id = ord.d_id
                                    LEFT JOIN tbl_zone AS dz
                                           ON JSON_CONTAINS(dr.zone, CONCAT('["', dz.id, '"]'), '$')
                                           OR JSON_CONTAINS(dr.zone, CONCAT('[', dz.id, ']'), '$')
                                    WHERE JSON_CONTAINS(dr.zone, CONCAT('["', '${zone_data[0].id}', '"]'), '$')
                                       OR JSON_CONTAINS(dr.zone, CONCAT('[', '${zone_data[0].id}', ']'), '$')
                                    ${ vid != "0" ? `AND dr.vehicle = '${vid}'` : '' }
                                    GROUP BY
                                        dr.id, dr.vehicle, dr.first_name, dr.last_name, dr.latitude, dr.longitude, ve.map_img, ve.name;
                                    `);

            zdata = zone_data[0];
        }
        
        res.send({status:true, data:zdata, dri, zone: zone_data[0].id})
    } catch (error) {
        console.log(error);
    }
})



module.exports = router;