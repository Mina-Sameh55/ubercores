/* jshint esversion: 6 */
/* jshint esversion: 8 */
/* jshint node: true */



const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const multer  = require('multer');
const mysql = require("mysql2");
const sendOneNotification = require("../middleware/send");
const { DataFind, DataInsert, DataUpdate, DataDelete } = require("../middleware/databse_query");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "./public/uploads/settings");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + file.originalname);

    }
});

// const upload = multer({storage : storage});

const fileFilter = (req, file, cb) => {
    if (file.fieldname === 'audio') {
        const allowedAudioTypes = /mp3|wav|m4a|flac/;
        const mimeType = allowedAudioTypes.test(file.mimetype);
        const extname = allowedAudioTypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimeType && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only audio files are allowed!'));
        }
    } else {
        cb(null, true);  // For images, allow all file types
    }
};
  
// Initialize multer with storage and file filter
const upload = multer({ storage: storage, fileFilter: fileFilter});

const storage1 = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "./public/uploads/payment_list");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + file.originalname);

    }
});

const paymentimg = multer({storage : storage1});

const storage2 = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "./public/uploads/payout");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + file.originalname);

    }
});

const payout = multer({storage : storage2});

const storage3 = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "./public/uploads/push_notification");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + file.originalname);

    }
});

const push_notification = multer({storage : storage3});


router.get("/general", auth, async(req, res)=>{
    try {
        let module = await DataFind(`SELECT id, name FROM tbl_module_setting`);
        const general_setting = await DataFind(`SELECT * FROM tbl_general_settings`);
        const payment_list = await DataFind(`SELECT * FROM tbl_payment_detail`);

        res.render("general_setting", {
            auth:req.user, general:general_setting[0], noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, payment_list, module
        })
    } catch (error) {
        console.log(error);
    }
})

router.post("/add_setting", auth, upload.fields([{name: 'dark_image', maxCount: 1}, {name: 'light_image', maxCount: 1}, {name: 'alert_tone', maxCount: 1}]), async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {title, site_currency, currency_status, thousands_separator, google_map_key, commission_rate, commisiion_type, weather_price, weather_type, signup_credit, 
            refer_credit, s_min_withdraw, one_app_id, one_api_key, tstatus, smstype, msgkey, msgid, twisid, twitoken, twipnumber, outstation, rental, package, dpayment, 
            ride_radius, vehicle_radius, def_driver, driver_wait_time, driver_wait_price, dri_offer_increment, offer_time, offer_expire_time, out_no_min_free_wait,
            out_after_min_wait_price, out_tot_offer_increment, out_offer_exprie_time_cus, out_offer_exprie_time_dri, ren_no_min_free_wait, ren_after_min_wait_price, 
            ren_tot_offer_increment, ren_offer_exprie_time_cus, ren_offer_exprie_time_dri, pack_no_min_free_wait, pack_after_min_wait_price, 
            pack_tot_offer_increment, pack_offer_exprie_time_cus, pack_offer_exprie_time_dri
        } = req.body;
        const general_setting = await DataFind(`SELECT * FROM tbl_general_settings`);

        const dark_img = req.files.dark_image ? "uploads/settings/" + req.files.dark_image[0].filename : general_setting[0].dark_image;
        const light_img = req.files.light_image ? "uploads/settings/" + req.files.light_image[0].filename : general_setting[0].light_image;
        const alr_tone = req.files.alert_tone ? "uploads/settings/" + req.files.alert_tone[0].filename : general_setting[0].alert_tone;
        let currency_placement = currency_status == "on" ? 1 : 0;
        let ctype = commisiion_type == "on" ? '%' : 'fix';
        let wtype = weather_type == "on" ? '%' : 'fix';
        const outstat = outstation == "on" ? 1 : 0;
        const rent = rental == "on" ? 1 : 0;
        const pack = package == "on" ? 1 : 0;
        const d_def = def_driver == "on" ? 1 : 0;

        if (general_setting == "") {

            if (await DataInsert(`tbl_general_settings`,
                `dark_image, light_image, alert_tone, title, site_currency, currency_placement, thousands_separator, google_map_key, commission_rate, commisiion_type, weather_price, 
                weather_type, signup_credit, refer_credit, s_min_withdraw, one_app_id, one_api_key, dformat, sms_type, msg_key, msg_token, twilio_sid, twilio_token, 
                twilio_phoneno, oustation, rental, package, default_payment, ride_radius, vehicle_radius, def_driver, driver_wait_time, driver_wait_price, dri_offer_increment,
                offer_time, offer_expire_time, out_no_min_free_wait, out_after_min_wait_price, out_tot_offer_increment, out_offer_exprie_time_cus, out_offer_exprie_time_dri,
                ren_no_min_free_wait, ren_after_min_wait_price, ren_tot_offer_increment, ren_offer_exprie_time_cus, ren_offer_exprie_time_dri, pack_no_min_free_wait, 
                pack_after_min_wait_price, pack_tot_offer_increment, pack_offer_exprie_time_cus, pack_offer_exprie_time_dri`,
                `'${dark_img}', '${light_img}', '${alr_tone}', '${title}', '${site_currency}', '${currency_placement}', '${thousands_separator}', '${google_map_key}', 
                '${commission_rate}', '${ctype}', '${weather_price}', '${wtype}', '${signup_credit}', '${refer_credit}', '${s_min_withdraw}', '${one_app_id}', '${one_api_key}', 
                '${tstatus}', '${smstype}', '${msgkey}', '${msgid}', '${twisid}', '${twitoken}', '${twipnumber}', '${outstat}', '${rent}', '${pack}', '${dpayment}', 
                '${ride_radius}', '${vehicle_radius}', '${d_def}', '${driver_wait_time}', '${driver_wait_price}', '${dri_offer_increment}', '${offer_time}', '${offer_expire_time}', 
                '${out_no_min_free_wait}', '${out_after_min_wait_price}', '${out_tot_offer_increment}', '${out_offer_exprie_time_cus}', '${out_offer_exprie_time_dri}', 
                '${ren_no_min_free_wait}', '${ren_after_min_wait_price}', '${ren_tot_offer_increment}', '${ren_offer_exprie_time_cus}', '${ren_offer_exprie_time_dri}', 
                '${pack_no_min_free_wait}', '${pack_after_min_wait_price}', '${pack_tot_offer_increment}', '${pack_offer_exprie_time_cus}', '${pack_offer_exprie_time_dri}'`, 
                req.hostname, req.protocol) == -1) {
                
                req.flash('errors', process.env.dataerror);
                return res.redirect("/valid_license");
            }

            
            
        } else {

            if (await DataUpdate(`tbl_general_settings`,
                `dark_image = '${dark_img}', light_image = '${light_img}', alert_tone = '${alr_tone}', title = '${title}', site_currency = '${site_currency}', currency_placement = '${currency_placement}', 
                thousands_separator = '${thousands_separator}', google_map_key = '${google_map_key}', commission_rate = '${commission_rate}', commisiion_type = '${ctype}', 
                weather_price = '${weather_price}', weather_type = '${wtype}', signup_credit = '${signup_credit}', refer_credit = '${refer_credit}', s_min_withdraw = '${s_min_withdraw}', 
                one_app_id = '${one_app_id}', one_api_key = '${one_api_key}', dformat = '${tstatus}', sms_type = '${smstype}', msg_key = '${msgkey}', msg_token = '${msgid}', 
                twilio_sid = '${twisid}', twilio_token = '${twitoken}', twilio_phoneno = '${twipnumber}', outstation = '${outstat}', rental = '${rent}', package = '${pack}',
                default_payment = '${dpayment}', ride_radius = '${ride_radius}', vehicle_radius = '${vehicle_radius}', def_driver = '${d_def}', 
                
                driver_wait_time = '${driver_wait_time}', driver_wait_price = '${driver_wait_price}', dri_offer_increment = '${dri_offer_increment}', 
                offer_time = '${offer_time}', offer_expire_time = '${offer_expire_time}',
                
                out_no_min_free_wait = '${out_no_min_free_wait}', out_after_min_wait_price = '${out_after_min_wait_price}', out_tot_offer_increment = '${out_tot_offer_increment}', 
                out_offer_exprie_time_cus = '${out_offer_exprie_time_cus}', out_offer_exprie_time_dri = '${out_offer_exprie_time_dri}',

                ren_no_min_free_wait = '${ren_no_min_free_wait}', ren_after_min_wait_price = '${ren_after_min_wait_price}', ren_tot_offer_increment = '${ren_tot_offer_increment}', 
                ren_offer_exprie_time_cus = '${ren_offer_exprie_time_cus}', ren_offer_exprie_time_dri = '${ren_offer_exprie_time_dri}',
                
                pack_no_min_free_wait = '${pack_no_min_free_wait}', pack_after_min_wait_price = '${pack_after_min_wait_price}', pack_tot_offer_increment = '${pack_tot_offer_increment}', 
                pack_offer_exprie_time_cus = '${pack_offer_exprie_time_cus}', pack_offer_exprie_time_dri = '${pack_offer_exprie_time_dri}'`,
                
                `id = '${general_setting[0].id}'`, req.hostname, req.protocol) == -1) {
        
                req.flash('errors', process.env.dataerror);
                return res.redirect("/valid_license");
            }
        }

        req.flash('success', 'Setting Updated successfully');
        res.redirect("/settings/general");

    } catch (error) {
        console.log(error);
    }
})

// ============= Driver Document Setting ================ //

router.get("/payment", auth, async(req, res)=>{
    try {
        const payment_list = await DataFind(`SELECT * FROM tbl_payment_detail`);

        // if (await DataInsert(`tbl_payment_detail`, `image, name, sub_title, attribute, status, wallet_status`,
        //     `'uploads/payment_list/17097958666741702644757.png', 'Bank Account', 'Card, pay with USSD, pay with bank, pay with barter', 'abc,test,23423543565436456,DSFDSF123,FSDS454', 
        //     '1', '1'`, req.hostname, req.protocol) == -1) {
        
        //     req.flash('errors', process.env.dataerror);
        //     return res.redirect("/valid_license");
        // }
        
        res.render("payment_detail", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, payment_list
        })
    } catch (error) {
        console.log(error);
    }
})

router.get("/edit_payment/:id", auth, async(req, res)=>{
    try {
        const payment_list = await DataFind(`SELECT * FROM tbl_payment_detail WHERE id = '${req.params.id}'`);
        let attribute = payment_list[0].attribute.split(",");
        
        res.render("edit_payment_detail", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, payment_list, attribute
        })
    } catch (error) {
        console.log(error);
    }
})

router.post("/edit_payment_data/:id", auth, paymentimg.fields([{name: 'image', maxCount: 1}, {name: 'qrcode', maxCount: 1}]), async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {name, sub_title, attribute, status, wallet_status, bankname, bholder, accno, ifccode, swiftcode} = req.body;

        let attrib, id = req.params.id
        const payment = await DataFind(`SELECT image, attribute FROM tbl_payment_detail WHERE id = '${id}'`);
        const imageUrl = req.files.image ? "uploads/payment_list/" + req.files.image[0].filename : payment[0].image;
        const wstatus_no = wallet_status == "on" ? 1 : 0;

        if (id == "10") attrib = req.files.qrcode ? "uploads/payment_list/" + req.files.qrcode[0].filename : payment[0].attribute;
        else if (id == "11") attrib = `${bankname},${bholder},${accno},${ifccode},${swiftcode}`
        else attrib = attribute

        if (await DataUpdate(`tbl_payment_detail`,
            `image = '${imageUrl}', name = '${name}', sub_title = '${sub_title}', attribute = '${attrib}', status = '${status}', wallet_status = '${wstatus_no}'`,
            `id = '${req.params.id}'`, req.hostname, req.protocol) == -1) {
        
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }

        req.flash('success', 'Payment Data Updated successfully');
        res.redirect("/settings/payment");
    } catch (error) {
        console.log(error);
    }
});





// ============= Ride Cancel Reason ================ //

router.get("/ride_cancel", auth, async(req, res)=>{
    try {
        const reason_list = await DataFind(`SELECT * FROM tbl_ride_cancel_reason`);
        
        res.render("ride_cancel_reason", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, reason_list
        })
    } catch (error) {
        console.log(error);
    }
})

router.post("/add_ride_c_reason", auth, async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {title, status} = req.body;

        const estitle = mysql.escape(title)
        const statuss = status == "on" ? 1 : 0;

        if (await DataInsert(`tbl_ride_cancel_reason`, `title, status`, `${estitle}, '${statuss}'`, req.hostname, req.protocol) == -1) {
    
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }

        req.flash('success', 'Ride Cancel Reason Add successfully');
        res.redirect("/settings/ride_cancel");
    } catch (error) {
        console.log(error);
    }
})

router.post("/edit_ride_c_reason/:id", auth, async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {title, status} = req.body;

        const estitle = mysql.escape(title)
        const statuss = status == "on" ? 1 : 0;

        if (await DataUpdate(`tbl_ride_cancel_reason`, `title = ${estitle}, status = ${statuss}`, `id = '${req.params.id}'`, req.hostname, req.protocol) == -1) {
    
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }

        req.flash('success', 'Ride Cancel Reason Updated successfully');
        res.redirect("/settings/ride_cancel");
    } catch (error) {
        console.log(error);
        
    }
})

router.get("/ride_c_reason_delete/:id", auth, async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        if (await DataDelete(`tbl_ride_cancel_reason`, `id = '${req.params.id}'`, req.hostname, req.protocol) == -1) {
        
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }
        
        req.flash('success', 'Ride Cancel Reason Deleted successfully');
        res.redirect("/settings/ride_cancel");
    } catch (error) {
        console.log(error);
        
    }
})





// ============= Ride Review List ================ //

router.get("/ride_review", auth, async(req, res)=>{
    try {
        const reason_list = await DataFind(`SELECT * FROM tbl_ride_review_reason`);
        
        res.render("ride_review_reason", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, reason_list
        })
    } catch (error) {
        console.log(error);
    }
})

router.post("/add_review_reason", auth, async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {title, status} = req.body;

        const estitle = mysql.escape(title)
        const statuss = status == "on" ? 1 : 0;

        if (await DataInsert(`tbl_ride_review_reason`, `title, status`, `${estitle}, '${statuss}'`, req.hostname, req.protocol) == -1) {
    
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }

        req.flash('success', 'Ride Review Add successfully');
        res.redirect("/settings/ride_review");
    } catch (error) {
        console.log(error);
    }
})

router.post("/edit_review_reason/:id", auth, async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {title, status} = req.body;

        const estitle = mysql.escape(title)
        const statuss = status == "on" ? 1 : 0;

        if (await DataUpdate(`tbl_ride_review_reason`, `title = ${estitle}, status = ${statuss}`, `id = '${req.params.id}'`, req.hostname, req.protocol) == -1) {
    
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }

        req.flash('success', 'Ride Review Updated successfully');
        res.redirect("/settings/ride_review");
    } catch (error) {
        console.log(error);
        
    }
})

router.get("/review_reason_delete/:id", auth, async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        if (await DataDelete(`tbl_ride_review_reason`, `id = '${req.params.id}'`, req.hostname, req.protocol) == -1) {
        
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }
        
        req.flash('success', 'Ride Review Deleted successfully');
        res.redirect("/settings/ride_review");
    } catch (error) {
        console.log(error);
        
    }
})



// ============= Payout Detail ================ //

router.get("/payout", auth, async(req, res)=>{
    try {
        const payout_list = await DataFind(`SELECT wd.*, COALESCE(dri.email, '') AS dri_email
                                            FROM tbl_wallet_withdraw AS wd
                                            JOIN tbl_driver AS dri ON wd.driver_id = dri.id
                                            ORDER BY wd.id DESC`);

        payout_list.map(val => {
            const date = new Date(val.date);
            const formattedDate = date.toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }); 
            val.date = formattedDate;
            return val;
        });
        
        res.render("payout", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, payout_list
        })
    } catch (error) {
        console.log(error);
    }
})

router.post("/add_wpayment", auth, payout.single('image'), async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {payment_sid} = req.body;

        const imageUrl = req.file ? "uploads/payout/" + req.file.filename : null;

        if (await DataUpdate(`tbl_wallet_withdraw`, `image = '${imageUrl}', status = '1'`, `id = '${payment_sid}'`, req.hostname, req.protocol) == -1) {
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }
        
        req.flash('success', 'Payout Add successfully');
        res.redirect("/settings/payout");
    } catch (error) {
        console.log(error);
    }
});


router.get("/cash_adjustment", auth, async(req, res)=>{
    try {
        const cash_list = await DataFind(`SELECT wd.*, COALESCE(dri.first_name, '') AS first_name, COALESCE(dri.last_name, '') AS last_name, COALESCE(dri.email, '') AS dri_email
                                        FROM tbl_cash_adjust AS wd
                                        JOIN tbl_driver AS dri ON wd.driver_id = dri.id
                                        ORDER BY wd.id DESC`);

        cash_list.map(val => {
            const date = new Date(val.date);
            
            const formattedDate = date.toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }); 
            val.date = formattedDate;
            return val;
        });
        
        res.render("driver_cash_adjustment", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, cash_list
        })
    } catch (error) {
        console.log(error);
    }
})

router.post("/accept_driver_cash", auth, async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {id} = req.body;
        
        const cash_list = await DataFind(`SELECT cadj.*, COALESCE(dri.tot_cash, 0) as tot_cash
                                            FROM tbl_cash_adjust AS cadj
                                            JOIN tbl_driver AS dri ON cadj.driver_id = dri.id
                                            WHERE cadj.id = '${id}' GROUP BY cadj.id;`);

        if (cash_list.length > 0) {
            let tot_cash = Number((Number(cash_list[0].tot_cash) - Number(cash_list[0].amount)).toFixed(2));

            if (await DataUpdate(`tbl_driver`, `tot_cash = '${tot_cash}'`, `id = '${cash_list[0].driver_id}'`, req.hostname, req.protocol) == -1) {
                return res.status(200).json({ ResponseCode: 401, Result:false, message: process.env.dataerror });
            }
    
            if (await DataUpdate(`tbl_cash_adjust`, `status = '1'`, `id = '${id}'`, req.hostname, req.protocol) == -1) {
                req.flash('errors', process.env.dataerror);
                return res.redirect("/valid_license");
            }
            
            return res.send({ status: true, message: 'Cash Amount Request Accepeted', approve: req.lan.ld.Approve });
        } else {
            return res.send({ status: false, message: 'Data not found!' });
        }
    } catch (error) {
        console.log(error);
        res.send({ status: false, message: 'Internal Server Error!' });
    }
});

router.post("/reject_driver_cash", auth, async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {id} = req.body;

        if (await DataUpdate(`tbl_cash_adjust`, `status = '2'`, `id = '${id}'`, req.hostname, req.protocol) == -1) {
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }
        
        return res.send({ status: true, message: 'Cash Request Rejected', reject: req.lan.ld.Reject });
    } catch (error) {
        return res.send({ status: false, message: 'Internal Server Error!' });
    }
});





// ============= FAQ List ================ //

router.get("/faq", auth, async(req, res)=>{
    try {
        const faq_list = await DataFind(`SELECT * FROM tbl_list_faq`);
        
        res.render("faq", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, faq_list
        })
    } catch (error) {
        console.log(error);
    }
});

router.post("/add_faq", auth, async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {title, description, status} = req.body;

        let estitle = mysql.escape(title), esdec = mysql.escape(description), statuss = status == "on" ? 1 : 0;
        if (await DataInsert(`tbl_list_faq`, `title, description, status`, `${estitle}, ${esdec}, '${statuss}'`, req.hostname, req.protocol) == -1) {
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }
        
        req.flash('success', 'FAQ Add successfully');
        res.redirect("/settings/faq");
    } catch (error) {
        console.log(error);
    }
});

router.post("/edit_faq/:id", auth, async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {title, description, status} = req.body;

        let estitle = mysql.escape(title), esdec = mysql.escape(description), statuss = status == "on" ? 1 : 0;

        if (await DataUpdate(`tbl_list_faq`, `title = ${estitle}, description = ${esdec}, status = '${statuss}'`, `id = '${req.params.id}'`, req.hostname, req.protocol) == -1) {
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }

        req.flash('success', 'FAQ Updated successfully');
        res.redirect("/settings/faq");
    } catch (error) {
        console.log(error);
        
    }
})

router.get("/delete_faq/:id", auth, async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        if (await DataDelete(`tbl_list_faq`, `id = '${req.params.id}'`, req.hostname, req.protocol) == -1) {
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }
        
        req.flash('success', 'FAQ Deleted successfully');
        res.redirect("/settings/faq");
    } catch (error) {
        console.log(error);
        
    }
})



// ============= Pages List ================ //

router.get("/Pages", auth, async(req, res)=>{
    try {
        const pages_list = await DataFind(`SELECT * FROM tbl_list_pages`);
        
        res.render("pages", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, pages_list
        })
    } catch (error) {
        console.log(error);
    }
});

router.get("/edit_Pages/:id", auth, async(req, res)=>{
    try {
        const page = await DataFind(`SELECT * FROM tbl_list_pages WHERE id = '${req.params.id}'`);

        res.render("edit_pages", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, page
        })
    } catch (error) {
        console.log(error);
    }
});

router.post("/edit_pages_data/:id", auth, async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {title, description, status} = req.body;

        let estitle = mysql.escape(title), esdec = mysql.escape(description);

        // if (await DataInsert(`tbl_list_pages`, `title, description, status`, `${estitle}, ${esdec}, '${status}'`, req.hostname, req.protocol) == -1) {
        //     req.flash('errors', process.env.dataerror);
        //     return res.redirect("/valid_license");
        // }

        if (await DataUpdate(`tbl_list_pages`, `title = ${estitle}, description = ${esdec}, status = '${status}'`, `id = '${req.params.id}'`, req.hostname, req.protocol) == -1) {
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }

        req.flash('success', 'Pages Updated successfully');
        res.redirect("/settings/Pages");
    } catch (error) {
        console.log(error);
        
    }
});





// ============= Send Notification ================ //

router.get("/send_notification", auth, async(req, res)=>{
    try {
        const customer = await DataFind(`SELECT * FROM tbl_customer WHERE status = '1'`);
        const driver = await DataFind(`SELECT id, first_name, last_name FROM tbl_driver WHERE status = '1' AND approval_status = '1'`);
        
        // customer, driver
        const ndata = await DataFind(`SELECT noti.*, COALESCE(cus.name, '') AS cus_name, COALESCE(dri.first_name, '') AS first_name, COALESCE(dri.last_name, '') AS last_name
                                        FROM tbl_send_notification AS noti
                                        LEFT JOIN tbl_customer AS cus ON noti.customer != 'All' AND noti.customer != '' AND noti.customer = cus.id 
                                        LEFT JOIN tbl_driver AS dri ON noti.driver != 'All' AND noti.driver != '' AND noti.driver = dri.id 
                                        ORDER BY noti.id DESC`);

        let data = ndata.map(async(nval) => {
            if (nval.title.length > 10) nval.title = nval.title.slice(0, 10) + "...";
            if (nval.description.length > 10) nval.description = nval.description.slice(0, 16) + "...";

            const date = new Date(nval.date);
            const formattedDate = date.toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
            nval.date = formattedDate;

            return nval;
        });
        let pdata = await Promise.all(data);
        
        res.render("send_notification", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, customer, driver, pdata
        });
    } catch (error) {
        console.log(error);
    }
});

router.post("/send_save_notification", auth, push_notification.single('image'), async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {title, description, selecttype, customer, allcustomer, driver, alldriver} = req.body;

        const imageUrl = req.file ? "uploads/push_notification/" + req.file.filename : '';
        let cid = "", d_id = "", cdata = 0, ddata = 0;
        if (selecttype == "2") {

            if(allcustomer == "on") {
                cid = "All"; cdata = await DataFind(`SELECT id FROM tbl_customer WHERE status = '1'`);
            } else if (customer != undefined) {
                cid = customer; cdata = [{ id: customer}];
            }

            if(alldriver == "on") {
                d_id = "All"; ddata = await DataFind(`SELECT id FROM tbl_driver WHERE status = '1' AND fstatus = '1'`);
            } else if(driver != undefined) {
                d_id = driver; ddata = [{ id: driver }];
            }
        } else {
            cid = "All"; d_id = "All";
            cdata = await DataFind(`SELECT * FROM tbl_customer WHERE status = '1'`);
            ddata = await DataFind(`SELECT * FROM tbl_driver WHERE status = '1' AND fstatus = '1'`);
        }

        if (cdata == 0) {
            if (ddata == 0) {
                req.flash('errors', "User not exist!");
                return res.redirect("back")
            }
        }

        const general_setting = await DataFind(`SELECT title FROM tbl_general_settings`)
        let baseURL = req.protocol == "http" ? `${req.protocol}://${req.hostname}:${process.env.port}/` : `${req.protocol}://${req.hostname}/`;
        let checkt = "", checkd = "", img = `${baseURL}${imageUrl}`;
        
        if (description != "") {
            checkt = title; checkd = description;
        } else {
            checkt = general_setting[0].title; checkd = title;
        }

        let data = {title:checkt, description:checkd, imageUrl:img}, date = new Date().toISOString();
        
        await sendNotification(cdata, ddata, data);

        let esname = mysql.escape(title), esdec = mysql.escape(description);
        if (await DataInsert(`tbl_send_notification`, `image, title, description, customer, driver, count, date, status`,
            `'${imageUrl}', ${title ? esname : ''}, ${description ? esdec : ''}, '${cid}', '${d_id}', '1', '${date}', '1'`, req.hostname, req.protocol) == -1) {
        
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }

        req.flash('success', 'Notification Send successfully');
        res.redirect("/settings/send_notification");
    } catch (error) {
        console.log(error);
    }
});

router.get("/noti_resend/:id", auth, async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const ndata = await DataFind(`SELECT * FROM tbl_send_notification WHERE id = '${req.params.id}'`);

        if (ndata[0].status == "1") {
            
            let cdata = 0, ddata = 0;
            if (ndata[0].customer == "All") {
                cdata = await DataFind(`SELECT * FROM tbl_customer WHERE status = '1'`);
            } else if(ndata[0].customer != "") {
                cdata = [{ id: ndata[0].customer}];
            }
    
            if (ndata[0].driver == "All") {
                ddata = await DataFind(`SELECT * FROM tbl_driver WHERE status = '1' AND fstatus = '1'`);
            } else if(ndata[0].driver != "") {
                ddata = [{ id: ndata[0].driver}];
            }

            if (cdata == 0) {
                if (ddata == 0) {
                    req.flash('errors', "User not exist!");
                    return res.redirect("back")
                }
            }

            let count = parseFloat(ndata[0].count) + parseFloat(1);

            if (await DataUpdate(`tbl_send_notification`, `count = '${count}'`, `id = '${ndata[0].id}'`, req.hostname, req.protocol) == -1) {
                req.flash('errors', process.env.dataerror);
                return res.redirect("/valid_license");
            }

            const general_setting = await DataFind(`SELECT title FROM tbl_general_settings`)
            let baseURL = req.protocol == "http" ? `${req.protocol}://${req.hostname}:${process.env.port}/` : `${req.protocol}://${req.hostname}/`;
            let checkt = "", checkd = "", img = `${baseURL}${ndata[0].image}`;

            if (ndata[0].description != "") {
                checkt = ndata[0].title; checkd = ndata[0].description
            } else {
                checkt = general_setting[0].title; checkd = ndata[0].title
            }

            let data = {title:checkt, description:checkd, imageUrl:img};
    
            await sendNotification(cdata, ddata, data);
    
            req.flash('success', 'Notification Send successfully');
        } else {
            req.flash('errors', 'Notification Deactivated');
        }
        res.redirect("/settings/send_notification");
    } catch (error) {
        console.log(error);
    }
});

async function sendNotification(cdata, ddata, data) {
    if (cdata != 0) {
        if (cdata != "0" && cdata[0].id != undefined) {
            cdata.forEach(cval => {
                sendOneNotification("", 'customer', cval.id, data);
            });
        }
    }
    
    if (ddata != 0) {
        if (ddata != "0" && ddata[0].id != undefined) {
            ddata.forEach(dval => {
                sendOneNotification("", 'driver', dval.id, data);
            });
        }
    }
}

router.get("/send_edit/:id", auth, async(req, res)=>{
    try {
        const customer = await DataFind(`SELECT * FROM tbl_customer WHERE status = '1'`);
        const driver = await DataFind(`SELECT * FROM tbl_driver WHERE status = '1' AND fstatus = '1'`);
        const ndata = await DataFind(`SELECT * FROM tbl_send_notification WHERE id = '${req.params.id}'`);
        
        res.render("send_notification_edit", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, customer, driver, ndata:ndata[0]
        });
    } catch (error) {
        console.log(error);
    }
});

router.post("/editsend/:id", auth, push_notification.single('image'), async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {title, description, selecttype, customer, allcustomer, driver, alldriver, status} = req.body;

        let cid = "", d_id = "", cdata = 0, ddata = 0;
        if (selecttype == "2") {
            if(allcustomer == "on") {
                cid = "All"; cdata = await DataFind(`SELECT * FROM tbl_customer WHERE status = '1'`);
            } else if (customer != undefined) {
                cid = customer; cdata = [{ id: customer}];
            }

            if(alldriver == "on") {
                d_id = "All"; ddata = await DataFind(`SELECT * FROM tbl_driver WHERE status = '1' AND fstatus = '1'`);
            } else if(driver != undefined) {
                d_id = driver; ddata = [{ id: driver }];
            }
        } else {
            cid = "All"; d_id = "All";
            cdata = await DataFind(`SELECT * FROM tbl_customer WHERE status = '1'`);
            ddata = await DataFind(`SELECT * FROM tbl_driver WHERE status = '1' AND fstatus = '1'`);
        }

        if (cdata == 0) {
            if (ddata == 0) {
                req.flash('errors', "User not exist!");
                return res.redirect("back")
            }
        }

        const ndata = await DataFind(`SELECT * FROM tbl_send_notification WHERE id = '${req.params.id}'`);

        if (ndata) {
            const imageUrl = req.file ? "uploads/push_notification/" + req.file.filename : ndata[0].image;
    
            const general_setting = await DataFind(`SELECT title FROM tbl_general_settings`)
            let baseURL = req.protocol == "http" ? `${req.protocol}://${req.hostname}:${process.env.port}/` : `${req.protocol}://${req.hostname}/`;
            let checkt = "", checkd = "", img = `${baseURL}${imageUrl}`;
            
            if (description != "") {
                checkt = title; checkd = description
            } else {
                checkt = general_setting[0].title; checkd = title
            }
    
            let data = {title:checkt, description:checkd, imageUrl:img}
            
            await sendNotification(cdata, ddata, data);
    
            let nstatus = status == "on" ? "1" : "0", count = parseFloat(ndata[0].count) + parseFloat(1);
            let esname = mysql.escape(title), esdec = mysql.escape(description);
            if (await DataUpdate(`tbl_send_notification`,
                `image = '${imageUrl}', title = ${esname}, description = ${esdec}, customer = '${cid}', driver = '${d_id}', count = '${count}', status = '${nstatus}'`,
                `id = '${ndata[0].id}'`, req.hostname, req.protocol) == -1) {
            
                req.flash('errors', process.env.dataerror);
                return res.redirect("/valid_license");
            }
    
            req.flash('success', 'Notification Updated successfully');
        } else req.flash('errors', 'Notification Data Not Found!');
        res.redirect("/settings/send_notification");
    } catch (error) {
        console.log(error);
    }
});

router.get("/noti_delete/:id", auth, async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        if (await DataDelete(`tbl_send_notification`, `id = '${req.params.id}'`, req.hostname, req.protocol) == -1) {
        
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }
        
        req.flash('success', 'Notification Deleted successfully');
        res.redirect("/settings/send_notification");
    } catch (error) {
        console.log(error);
    }
});





module.exports = router;