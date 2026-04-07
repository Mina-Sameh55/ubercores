/* jshint esversion: 6 */
/* jshint esversion: 8 */
/* jshint node: true */



const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const multer  = require('multer');
const mysql = require("mysql2");
const { DataFind, DataInsert, DataUpdate, DataDelete } = require("../middleware/databse_query");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "./public/uploads/category");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + file.originalname);

    }
});

const upload = multer({storage : storage});

const storage2 = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "./public/uploads/module_setting");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + file.originalname);

    }
});

const msetting = multer({storage : storage2});



// ============= Outstation Category ================ //

router.get("/category", auth, async(req, res)=>{
    try {
        const package_category = await DataFind(`SELECT * FROM tbl_package_category ORDER BY id DESC`);
        
        res.render("package_category", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, package_category
        })
    } catch (error) {
        console.log(error);
    }
})

router.get("/add_category", auth, async(req, res)=>{
    try {
        
        res.render("add_package_category", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname
        })
    } catch (error) {
        console.log(error);
    }
})

router.post("/add_categorydata", auth, upload.single('image'), async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {name, status} = req.body;

        const imageUrl = req.file ? "uploads/category/" + req.file.filename : null;
        const statuss = status == "on" ? 1 : 0;
        let esname = mysql.escape(name)

        if (await DataInsert(`tbl_package_category`, `image, name, status`,
            `'${imageUrl}', ${esname}, ${statuss}`, req.hostname, req.protocol) == -1) {
    
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }

        req.flash('success', 'Category Add successfully');
        res.redirect("/package/category");
    } catch (error) {
        console.log(error);
    }
})

router.get("/edit_category/:id", auth, async(req, res)=>{
    try {
        const package_category = await DataFind(`SELECT * FROM tbl_package_category WHERE id = '${req.params.id}'`);
        
        res.render("edit_package_category", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, category:package_category[0]
        })
    } catch (error) {
        console.log(error);
    }
})

router.post("/edit_categorydata/:id", auth, upload.single('image'), async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {name, status} = req.body;

        let imageUrl;
        if (req.file) {
            imageUrl = "uploads/category/" + req.file.filename
        } else {
            const category = await DataFind(`SELECT image FROM tbl_package_category WHERE id = '${req.params.id}'`);
            imageUrl = category[0].image
        }
        let esname = mysql.escape(name)
        const statuss = status == "on" ? 1 : 0;

        if (await DataUpdate(`tbl_package_category`, `image = '${imageUrl}', name = ${esname}, status = ${statuss}`,
            `id = '${req.params.id}'`, req.hostname, req.protocol) == -1) {
    
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }

        req.flash('success', 'Category Updated successfully');
        res.redirect("/package/category");
    } catch (error) {
        console.log(error);
        
    }
})

router.get("/delete_category/:id", auth, async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        if (await DataDelete(`tbl_package_category`, `id = '${req.params.id}'`, req.hostname, req.protocol) == -1) {
        
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }
        
        req.flash('success', 'Category Deleted successfully');
        res.redirect("/package/category");
    } catch (error) {
        console.log(error);
        
    }
})





// ============= Package ================ //

router.get("/setting", auth, async(req, res)=>{
    try {
        const msetting = await DataFind(`SELECT * FROM tbl_module_setting WHERE id = '3'`);
        
        res.render("package_setting", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, msetting
        })
    } catch (error) {
        console.log(error);
    }
})

router.post("/edit_rental_setting", auth, msetting.single('image'), async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {name, description} = req.body;

        let imageUrl;
        if (req.file) {
            imageUrl = "uploads/module_setting/" + req.file.filename
        } else {
            const Vehicle = await DataFind(`SELECT image FROM tbl_module_setting WHERE id = '3'`);
            imageUrl = Vehicle[0].image
        }

        let estitle = mysql.escape(name)
        let descri = mysql.escape(description)
        
        if (await DataUpdate(`tbl_module_setting`, `image = '${imageUrl}', name = ${estitle}, description = ${descri}`,
            `id = '2'`, req.hostname, req.protocol) == -1) {
                
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }
            
        // const imageUrl = req.file ? "uploads/module_setting/" + req.file.filename : null;
        // if (await DataInsert(`tbl_module_setting`, `image, name, description`, `'${imageUrl}', ${estitle}, ${descri}`, req.hostname, req.protocol) == -1) {
    
        //     req.flash('errors', process.env.dataerror);
        //     return res.redirect("/valid_license");
        // }

        req.flash('success', 'Vehicle Setting Updated successfully');
        res.redirect("/package/setting");
    } catch (error) {
        console.log(error);
        
    }
})



const storage3 = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "./public/uploads/package");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + file.originalname);

    }
});

const package = multer({storage : storage3});

router.get("/add", auth, async(req, res)=>{
    try {
        const vehicle_list = await DataFind(`SELECT id, name FROM tbl_vehicle WHERE status = "1"`);

        res.render("add_package", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, vehicle_list
        })
    } catch (error) {
        console.log(error);
    }
})

router.post("/add_package", auth, package.single('image'), async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {name, sub_title, up_to_km, up_to_fee, addi_km_rate, per_kg_price, num_of_kg, radius_km, comission_rate, comission_type, extra_charge, whether_charge,
            bidding_status_check, minimum_fare, maximum_fare, status, length, weight, height, vehicle } = req.body;

        const imageUrl = req.file ? "uploads/package/" + req.file.filename : null;
        const offer = bidding_status_check == "on" ? 1 : 0;
        const minfare = bidding_status_check == "on" ? minimum_fare : 0;
        const maxifare = bidding_status_check == "on" ? maximum_fare : 0;
        const crate = comission_type == "on" ? '%' : 'FIX';
        const ctype = whether_charge == "on" ? 1 : 0;
        const statuss = status == "on" ? 1 : 0;

        let avehicle = [];
        if (typeof vehicle == "string") avehicle = [vehicle].map(val => Number(val));
        else avehicle = [...vehicle].map(val => Number(val));

        if (await DataInsert(`tbl_package`,
            `image, name, sub_title, vehicle, up_to_km, up_to_fee, addi_km_rate, per_kg_price, num_of_kg, radius_km, length, weight, height, comission_rate, comission_type, 
            extra_charge, bidding, minimum_fare, maximum_fare, whether_charge, status`,
            `'${imageUrl}', ${mysql.escape(name)}, ${mysql.escape(sub_title)}, '${JSON.stringify(avehicle)}', '${up_to_km}', '${up_to_fee}', '${addi_km_rate}', '${per_kg_price}', 
            '${num_of_kg}', '${radius_km}', '${length}', '${weight}', '${height}', '${comission_rate}', '${crate}', '${extra_charge}', '${offer}', '${minfare}', '${maxifare}', 
            '${ctype}', '${statuss}'`, req.hostname, req.protocol) == -1) {
    
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }

        req.flash('success', 'Package Add successfully');
        res.redirect("/package/list");
    } catch (error) {
        console.log(error);
    }
});

router.get("/list", auth, async(req, res)=>{
    try {
        const package_list = await DataFind(`SELECT * FROM tbl_package`);
        
        res.render("package", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, package_list
        })
    } catch (error) {
        console.log(error);
    }
})

router.get("/edit/:id", auth, async(req, res)=>{
    try {
        const vehicle_list = await DataFind(`SELECT id, name FROM tbl_vehicle WHERE status = "1"`);
        const package_list = await DataFind(`SELECT * FROM tbl_package WHERE id = '${req.params.id}'`);
        if (package_list == '') {
            req.flash('errors', `Data not found!`);
            return res.redirect("back");
        }

        let vehicle = typeof package_list[0].vehicle == "string" ? JSON.parse(package_list[0].vehicle) : package_list[0].vehicle;
        
        res.render("edit_package", {
            auth:req.user, general:req.general, noti:req.notification, per:req.per, lan:req.lan.ld, land:req.lan.lname, package:package_list[0], vehicle_list, vehicle
        })
    } catch (error) {
        console.log(error);
    }
})


router.post("/edit_package/:id", auth, package.single('image'), async(req, res)=>{
    try {
          if (process.env.DISABLE_DB_WRITE === 'true') {
    req.flash('errors', 'For demo purpose we disabled crud operations!!');
    return res.redirect("back");
}
        const {name, sub_title, up_to_km, up_to_fee, addi_km_rate, per_kg_price, num_of_kg, radius_km, comission_rate, comission_type, extra_charge, whether_charge, bidding, minimum_fare, 
                maximum_fare, status, length, weight, height, vehicle} = req.body;

        const oustation_list = await DataFind(`SELECT * FROM tbl_package WHERE id = '${req.params.id}'`);
        if (oustation_list == '') {
            req.flash('errors', `Data not found!`);
            return res.redirect("back");
        }

        let imageUrl;
        if (req.file) imageUrl = "uploads/package/" + req.file.filename
        else imageUrl = oustation_list[0].image

        const offer = bidding == "on" ? 1 : 0;
        const minfare = bidding == "on" ? minimum_fare : 0;
        const maxifare = bidding == "on" ? maximum_fare : 0;
        const crate = comission_type == "on" ? '%' : 'FIX';
        const ctype = whether_charge == "on" ? 1 : 0;
        const statuss = status == "on" ? 1 : 0;

        let estitle = mysql.escape(name);
        let avehicle = [];
        if (typeof vehicle == "string") avehicle = [vehicle].map(val => Number(val));
        else avehicle = [...vehicle].map(val => Number(val));

        if (await DataUpdate(`tbl_package`,
            `image = '${imageUrl}', name = ${estitle}, sub_title = ${mysql.escape(sub_title)}, vehicle = '${JSON.stringify(avehicle)}', up_to_km = '${up_to_km}', up_to_fee = ${up_to_fee}, 
            addi_km_rate = '${addi_km_rate}', per_kg_price = '${per_kg_price}', num_of_kg = '${num_of_kg}', radius_km = '${radius_km}', length = '${length}', weight = '${weight}', 
            height = '${height}', comission_rate = '${comission_rate}', comission_type = '${crate}', extra_charge = '${extra_charge}', bidding = '${offer}', minimum_fare = '${minfare}', 
            maximum_fare = '${maxifare}', whether_charge = '${ctype}', status = '${statuss}'`, `id = '${oustation_list[0].id}'`, req.hostname, req.protocol) == -1) {
    
            req.flash('errors', process.env.dataerror); 
            return res.redirect("/valid_license");
        }

        req.flash('success', 'Package Updated successfully');
        res.redirect("/package/list");
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
        if (await DataDelete(`tbl_package`, `id = '${req.params.id}'`, req.hostname, req.protocol) == -1) {
        
            req.flash('errors', process.env.dataerror);
            return res.redirect("/valid_license");
        }
        
        req.flash('success', 'Package Deleted successfully');
        res.redirect("/package/list");
    } catch (error) {
        console.log(error);
    }
})




module.exports = router;