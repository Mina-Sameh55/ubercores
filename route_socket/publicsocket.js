const AllFunction = require("../route_function/function")
const AllChat = require("../route_function/chat_function")
const schedule = require('node-schedule');
// const { AddDriveLocation, RemoveDriveLocation, UpdateDriveLocation } = require("./js/map_driver_location");
const { DataFind, DataInsert, DataUpdate, DataDelete } = require("../middleware/databse_query");
let activeSchedules = [];
let jobs = [];



function publicsocket (io) {

io.on('connection', (socket) => {
    // console.log('Socket connected:', socket.id);

    // // Customer Home
    socket.on('home', async (message) => {
        // console.log('home');
        
        socket.broadcast.emit('home', message);
    })
    
    
    
    // // Home Map
    socket.on('homemap', async (homemessage) => {
        try {
            console.log("homemap");
            // console.log(homemessage);
            
            const {uid, status, driver_data, dlocations, ddata} = homemessage;
            const missingField = await AllFunction.CheckSocketData(homemessage, ["uid", "lat", "long", "status", "driver_data", "dlocations", "ddata"]);

            if(!missingField && driver_data.length > 0) {
                
                if (dlocations.homemap == "1") {
                    
                    driver_data[0].zone = typeof driver_data[0].zone == "string" ? JSON.parse(driver_data[0].zone) : driver_data[0].zone;

                    let id_lidt = driver_data[0].zone.map(val => {return Number(val)});
                    let data = {id: driver_data[0].id, image: driver_data[0].image, name: driver_data[0].name, description: driver_data[0].description, latitude: driver_data[0].latitude, longitude: driver_data[0].longitude, zone_list:id_lidt}
                    
                    if (driver_data[0].fstatus == "0" && status == "on") {
                        socket.broadcast.emit('Driver_location_On', data);
                    } else if (driver_data[0].fstatus == "1") {
                        if (status == "off") {
                            socket.broadcast.emit('Drive_location_Off', data);
                        }
                        if (status == "on") {
                            socket.broadcast.emit('Driver_location_Update', data);
                        }
                    }
                }
                        
                if (dlocations.vdriloc == 1) {
                    if (ddata.driver != "" && ddata.data != "") {
                        let d = ddata.data;
                        for (let i = 0; i < d.length;) {
                            console.log("V_Driver_Location");
                            
                            socket.broadcast.emit(`V_Driver_Location${d[i].c_id}`, {d_id : uid, driver_location:ddata.driver[0]});
                            i++
                        }
                    }
                }
            }
        } catch (error) {
            console.error(error);
            return socket.emit('database_error', { ResponseCode: 401, Result: false, message: process.env.dataerror});
        }
    })



    // // Send Vehicle Ride Request 
    socket.on('vehiclerequest', async (homemessage) => {
        const {requestid, driverid, c_id, m_role} = homemessage;
        // console.log("vehiclerequest");
        // console.log(homemessage);



        const gs = await DataFind(`SELECT ${ m_role == 1 ? 'offer_expire_time AS dri_off_expire_time' : 
                                            m_role == 2 ? 'out_offer_exprie_time_dri AS dri_off_expire_time' : 
                                            m_role == 3 ? 'ren_offer_exprie_time_dri AS dri_off_expire_time' :
                                            'pack_offer_exprie_time_dri AS dri_off_expire_time'
                                        }  FROM tbl_general_settings`);
        console.log(gs);

        const hostname = socket.request.headers.host;
        const protocol = socket.request.connection.encrypted ? 'https' : 'http';
        
        if (gs != "") {
            if (Number(gs[0].dri_off_expire_time) != NaN) {

                if (jobs != "") {
                    for (let i = 0; i < jobs.length; ) {
        
                        if (jobs[i].req_id == requestid && jobs[i].c_id == c_id) {
                            jobs[i].job.cancel();
                        }
                        i++;
                    }
                }
                
                let job = schedule.scheduleJob(new Date(Date.now() + Number(gs[0].dri_off_expire_time) * 1000), async function() {
                    
                    const rcheck = await DataFind(`SELECT id FROM tbl_request_vehicle WHERE id = '${requestid}' AND c_id = '${c_id}'`);
                    if (rcheck != "") {
                        console.log("Delete Ride");
                        
                        // if (await DataDelete(`tbl_request_vehicle`, `id = '${rcheck[0].id}'`, hostname, protocol) == -1) {
                        //     return res.status(200).json({ ResponseCode: 401, Result:false, message: 'Request Not Found!' });
                        // }
                    
                        // console.log(`removecustomerdata${c_id}`); 
                        // socket.emit(`removeotherdata${c_id}`, homemessage);

                        for (let i = 0; i < driverid.length;) {
                            socket.broadcast.emit(`removeotherdata${driverid[i]}`, homemessage);
                            i++;
                        }
                    }
                });
                
                jobs.push({job, req_id: requestid, c_id: c_id, driver_id: driverid});
            }
        }

        socket.broadcast.emit(`vehiclerequest`, homemessage)
    })
    
    // // Check Bidding Data
    socket.on('load_bidding_data', async (homemessage) => {
        const {uid, request_id, d_id, m_role} = homemessage;
        
        const missingField = await AllFunction.CheckSocketData(homemessage, ["uid", "request_id", "d_id", "m_role"]);
        if (!missingField) {
            
            const hostname = socket.request.headers.host;
            const protocol = socket.request.connection.encrypted ? 'https' : 'http';
    
            let ddatas = await AllFunction.VehicleBidding(d_id, request_id, 0, 2,m_role, hostname, protocol);
            
            if (ddatas != false) {
                socket.emit(`Vehicle_Bidding${uid}`, ddatas);
            }
        }
    })

    // // Send Vehicle Bidding Request
    socket.on('Vehicle_Bidding', async (homemessage) => {
        console.log("Vehicle_Bidding");
        // console.log(homemessage);
        
        const {uid, request_id, c_id, price, status, m_role} = homemessage;
        const missingField = await AllFunction.CheckSocketData(homemessage, ["uid", "request_id", "c_id", "price", "status", "m_role"]);

        const hostname = socket.request.headers.host;
        const protocol = socket.request.connection.encrypted ? 'https' : 'http';

        if (status == "1" || !missingField) {
            // console.log("status");
            
            let ddata = await AllFunction.VehicleBidding(uid, request_id, price, 1, m_role, hostname, protocol);
            
            if (ddata != false) {
                // console.log(ddata);
                socket.broadcast.emit(`Vehicle_Bidding${c_id}`, ddata);
                
                if (parseFloat(ddata.off_ex_time) > 0) {

                    let addtime = parseFloat(ddata.off_ex_time);
                    let job = schedule.scheduleJob(new Date(Date.now() + parseFloat(addtime) * 1000), async function() {
                        // console.log("Remove List Run");
                        // console.log("Remove List Run");
                        // console.log("Remove List Run");
        
                        let checkdata = 0;
                        activeSchedules.forEach(val => {
                            if (val.request_id == request_id && val.d_id == uid  && val.c_id == c_id) checkdata++
                        })
                        
                        if (checkdata > 0) {
                            // console.log(111);
                            let ddatas = await AllFunction.VehicleBidding(uid, request_id, price, 2, m_role, hostname, protocol);
                            // console.log(222);
                            // console.log(ddatas);

                            
                            if (ddatas != false) {
                                let dlidt = ddatas.nid_list, req_id = ddatas.request_id;
                                
                                socket.broadcast.emit(`Vehicle_Bidding${ddatas.c_id}`, { bidding_list: ddatas.bidding_list, off_ex_time: ddatas.off_ex_time });
                                // console.log(dlidt);

                                // let ndata = [];
                                // activeSchedules.forEach(val => {
                                //     if (val.request_id == request_id && val.d_id == uid  && val.c_id == c_id) val.job.cancel();
                                //     else ndata.push();
                                // })
                                // activeSchedules = ndata;
                                
                                // if (dlidt != "") {
                                //     for (let i = 0; i < dlidt.length;) {
                                //         socket.broadcast.emit(`TimeOut_Driver_VBidding${dlidt[i]}`, { req_id });
                                //         i++;
                                //     }
                                // }
                            }
                        }
                        
                    });
        
                    activeSchedules.push({ request_id, d_id: uid, c_id, job });
                }
            }
        }

        if (status == "2") {
            // console.log("Vehicle_Bidding");
            // console.log(homemessage);

            activeSchedules.forEach(val => {
                if (val.request_id == request_id && val.d_id == uid  && val.c_id == c_id) {
                    val.job.cancel();
                }
            })

            let remove = await AllFunction.VehicleBidding(uid, request_id, price, 3, m_role, hostname, protocol);
            // console.log(remove);
            // console.log(remove.c_id);
            // console.log("Vehicle_Bidding");
            
            if (remove != false) {
                socket.broadcast.emit(`Vehicle_Bidding${remove.c_id}`, { bidding_list: remove.bidding_list, off_ex_time: remove.off_ex_time });
            }
        }
    })

    

    // // Vehicle Request TimeOut 
    socket.on('Accept_Bidding', async(homemessage) => {
        console.log("Accept_Bidding");
        console.log(homemessage);
        
        const { uid, d_id, price, request_id, m_role } = homemessage;
        const missingField = await AllFunction.CheckSocketData(homemessage, ["uid", "d_id", "price", "request_id", "m_role"]);
        console.log("a");
        console.log(homemessage);
        
        if (!missingField) {

            for (let i = 0; i < jobs.length; ) {
                
                if (jobs[i].req_id == request_id) {
                    // console.log(jobs[i]);
                    jobs[i].job.cancel();
                }
                i++;
            }

            const rd = await DataFind(`SELECT * FROM tbl_request_vehicle WHERE id = '${request_id}' AND JSON_CONTAINS(d_id, '${d_id}')`);
            if (rd != "") { 

                activeSchedules.forEach(val => {
                    if (val.request_id == request_id) {
                        val.job.cancel();
                    }
                });

                const hostname = socket.request.headers.host;
                const protocol = socket.request.connection.encrypted ? 'https' : 'http';

                const accept = await AllFunction.AcceptVehicleRide(d_id, request_id, "0", "0", m_role, hostname, protocol, price, rd);

                if(accept != "1" && accept != "2" && accept != "3" && accept != "databaseerror") {
                    let idl = accept.reqmoveid
                    if (typeof idl == "string") idl = JSON.parse(accept.reqmoveid);
                    socket.broadcast.emit('AcceRemoveOther', { requestid: accept.requestid, driverid: idl});
                    socket.broadcast.emit(`Accept_Bidding${d_id}`, {requestid:accept.requestid});
                }
            }
        }
    })


    
    // // Vehicle Bidding Decline
    socket.on('Bidding_decline', async(homemessage) => {
        console.log("Bidding_decline");
        console.log(homemessage);

        const { uid, id, request_id, m_role } = homemessage;
        const missingField = await AllFunction.CheckSocketData(homemessage, ["uid", "id", "request_id", "m_role"]);

        if (!missingField) {
            const hostname = socket.request.headers.host;
            const protocol = socket.request.connection.encrypted ? 'https' : 'http';
    
            const accept = await AllFunction.VehicleBidding(id, request_id, "0", 4, m_role, hostname, protocol);
    
            if (accept != false) {
                // console.log("Bidding_declineaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
                // console.log(accept);
                
                // console.log("Bidding_decline");
                // console.log(activeSchedules);
                activeSchedules.forEach(val => {
                    
                    if (val.request_id == request_id && val.d_id == id  && val.c_id == uid) {
                        // console.log("Bidding_decline");
                        val.job.cancel();
                    }
                })

                socket.emit(`Vehicle_Bidding${uid}`, accept);
                socket.broadcast.emit(`Bidding_decline${id}`, {request_id: request_id});
            }
        }
    })

    // // Vehicle Request TimeOut 
    socket.on('Driver_Bidding_Req_Reject', async (homemessage) => {
        console.log('Driver_Bidding_Req_Reject');
        
        const { uid, c_id, request_id, m_role } = homemessage;
        const missingField = await AllFunction.CheckSocketData(homemessage, ["uid", "c_id", "request_id", "m_role"]);
        // console.log(missingField);
        
        if (!missingField) {
            const hostname = socket.request.headers.host;
            const protocol = socket.request.connection.encrypted ? 'https' : 'http';
    
            const accept = await AllFunction.VehicleBidding(uid, request_id, "0", 4, m_role, hostname, protocol);
            // console.log(accept);
            
            if (accept != false) {
                // console.log("Bidding_declineaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
                // console.log(accept);
                
                // console.log("Bidding_decline");
                activeSchedules.forEach(val => {
                    // console.log(val);
                    
                    if (val.request_id == request_id && val.d_id == uid  && val.c_id == c_id) {
                        // console.log("Bidding_decline");
                        val.job.cancel();
                    }
                })

                socket.broadcast.emit(`Vehicle_Bidding${c_id}`, accept);
                // socket.broadcast.emit(`Bidding_decline${uid}`, {request_id: request_id});
            }
        }
    })



    // // Vehicle Request TimeOut 
    socket.on('RequestTimeOut', (homemessage) => {
        socket.broadcast.emit('RequestTimeOut', homemessage);
    })

    // // Accept Vehicle Ride Request   { uid: '14', request_id: '27', c_id: '20' }
    socket.on('acceptvehrequest', async (homemessage) => {
        console.log("acceptvehrequest");
        // console.log(homemessage);

        const {uid, request_id, c_id} = homemessage;
        // jobs.push({job, req_id : requestid, c_id : c_id, driver_id: driverid});

        for (let i = 0; i < jobs.length; ) {
        
            // if (jobs[i].req_id == request_id && jobs[i].c_id == c_id && jobs[i].driver_id.includes(uid) == true) {
            if (jobs[i].req_id == request_id) {
                console.log(jobs[i]);
                jobs[i].job.cancel();
            }
            i++
        }

        let ddata = await AllFunction.SendDriverLatLong(homemessage.uid);
        // console.log(ddata);

        const rd = await DataFind(`SELECT id, driver_id_list FROM tbl_cart_vehicle WHERE id = '${request_id}' AND c_id = '${c_id}' AND d_id = '${uid}'`);
        if (rd != "") {
            let idlist = rd[0].driver_id_list
            if (typeof idlist == "string") idlist = JSON.parse(idlist);
            socket.broadcast.emit('AcceRemoveOther', { requestid:request_id, driverid: idlist});
        }
        
        socket.broadcast.emit(`acceptvehrequest${c_id}`, homemessage);

        if (ddata.driver != "" && ddata.data != "") {
            let d = ddata.data;
            // console.log(1111111111111);
            // console.log(`V_Driver_Location${homemessage.c_id}`);
            for (let i = 0; i < d.length;) {
                socket.broadcast.emit(`V_Driver_Location${d[i].c_id}`, {d_id : homemessage.uid, driver_location:ddata.driver[0]});
                i++;
            }
        }
    })

    // // Accept Vehicle Ride Request and Remove other driver
    socket.on('AcceRemoveOther', (homemessage) => {
        console.log("AcceRemoveOther");
        
        socket.broadcast.emit('AcceRemoveOther', homemessage);
    })





    // // Vehicle Ride Time Update
    socket.on('Vehicle_Time_update', async (homemessage) => {
        console.log('Vehicle_Time_update');
        
        const hostname = socket.request.headers.host;
        const protocol = socket.request.connection.encrypted ? 'https' : 'http';

        let date = await AllFunction.TimeUpdate(homemessage, hostname, protocol)
        if (date === true) socket.broadcast.emit(`Vehicle_Time_update${homemessage.c_id}`, homemessage);
    })

    // // Vehicle Ride Time Over Request
    socket.on('Vehicle_Time_Request', async (homemessage) => {
        // console.log(111);
        console.log(" ");
        // console.log(111);

        socket.broadcast.emit(`Vehicle_Time_Request${homemessage.d_id}`, homemessage);
    })

    // // Driver Request Accept And Cancel
    socket.on('Vehicle_Accept_Cancel', async(homemessage) => {
        console.log("Vehicle_Accept_Cancel");
        // console.log(homemessage);
        const {uid, request_id, c_id} = homemessage;

        const missingField = await AllFunction.CheckSocketData(homemessage, ["uid", "request_id", "c_id"]);
        if (!missingField) socket.broadcast.emit(`Vehicle_Accept_Cancel${c_id}`, { request_id, d_id: uid });
    })

    // // Rider Pick Customer
    socket.on('Vehicle_D_IAmHere', (homemessage) => {
        socket.broadcast.emit('Vehicle_D_IAmHere', homemessage);
    })

    // // Rider Cancel
    socket.on('Vehicle_Ride_Cancel', (homemessage) => {
        const {uid, driverid} = homemessage
        console.log(homemessage);
                                            
        if (typeof driverid != 'string') {
            socket.broadcast.emit(`Vehicle_Ride_Cancel${driverid}`, homemessage);
        } else {
            for (let a = 0; a < driverid.length;) {
                socket.broadcast.emit(`Vehicle_Ride_Cancel${driverid[a]}`, {uid:uid, driverid:driverid[a]});
                a++
            }
        }

    })

    // // Rider OTP
    socket.on('Vehicle_Ride_OTP', (homemessage) => {
        socket.broadcast.emit('Vehicle_Ride_OTP', homemessage);
    })



    // // Rider Start And End   { uid: '14', request_id: '27', c_id: '20' }
    socket.on('Vehicle_Ride_Start_End', async (homemessage) => {
        const {uid, c_id, request_id} = homemessage;

        // uid, d_id, request_id
        let dropdata = await AllFunction.VehicleRideStartEndData(uid, c_id, request_id);
        let ddata = await AllFunction.SendDriverLatLong(uid);
        // console.log(ddata);

        socket.broadcast.emit(`Vehicle_Ride_Start_End${c_id}`, dropdata);

        if (ddata.driver != "" && ddata.data != "") {
            let d = ddata.data;
            for (let i = 0; i < d.length;) {
                console.log("V_Driver_Locationaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
                socket.broadcast.emit(`V_Driver_Location${d[i].c_id}`, {d_id : homemessage.uid, driver_location: ddata.driver[0]});
                i++;
            }
        }

        if (dropdata.status == "7") {

            const hostname = socket.request.headers.host;
            const protocol = socket.request.connection.encrypted ? 'https' : 'http';
            const payment_price = await AllFunction.VehiclePaymentCal(uid, c_id, request_id, 2, hostname, protocol);

            console.log("Vehicle_Ride_Start_End");
            // console.log(payment_price);
            
            if (payment_price == "1" || !payment_price) socket.broadcast.emit(`Vehicle_Ride_Payment${c_id}`, { ResponseCode: 401, Result:false, message: 'Request Not Found!' });
            if (payment_price == "2") socket.broadcast.emit(`Vehicle_Ride_Payment${c_id}`, { ResponseCode: 401, Result:false, message: 'Please Complete Other Stap!' });
            if (payment_price == "3" || payment_price == "4") socket.broadcast.emit(`Vehicle_Ride_Payment${c_id}`, { ResponseCode: 401, Result:false, message: 'Something went wrong' });

            if (payment_price != "1" || payment_price != "2"|| payment_price != "3") socket.broadcast.emit(`Vehicle_Ride_Payment${c_id}`, 
            {ResponseCode: 200, Result:true, message: "Ride Complete Successful", price_list: payment_price.price_list, payment_data: payment_price.payment, 
            review_list:payment_price.review_list});
        }

        

        // let driver = await AllFunction.SendDriverLatLong(uid)
        // if (driver != "") socket.broadcast.emit(`V_Driver_Location${homemessage.c_id}`, {d_id : uid, driver_location:driver.driver[0]})
    })

    // // Dorp Location
    socket.on('drop_location_list', async (homemessage) => {
        console.log("drop_location_list");
        console.log(homemessage);
        const {d_id, c_id, r_id} = homemessage;

        let dropdata = await AllFunction.VehicleRideStartEndData(d_id, c_id, r_id);
        console.log(dropdata);
        console.log(`drop_location${c_id}`);
        console.log(`drop_location20`);
         
        socket.emit(`drop_location${c_id}`, dropdata);
    })


    // // Payment Method Change
    socket.on('Vehicle_P_Change', async (homemessage) => {
        const payment = await DataFind(`SELECT id, image, name FROM tbl_payment_detail WHERE id = '${homemessage.payment_id}' AND status = '1'`);
        
        if (payment != "") {
            await DataUpdate(`tbl_cart_vehicle`, `payment_id = '${payment[0].id}'`, `d_id = '${homemessage.d_id}' AND c_id = '${homemessage.userid}'`,
            socket.request.headers.host, socket.request.connection.encrypted ? 'https' : 'http');

            socket.broadcast.emit(`Vehicle_P_Change${homemessage.d_id}`, {payment_data:payment[0]});
        }
    })

    // // Payment Successful And Complete Ride
    socket.on('Vehicle_Ride_Complete', async (homemessage) => {

        socket.broadcast.emit(`Vehicle_Ride_Complete${homemessage.d_id}`, homemessage);
    })






    

    // // Save Chat
    socket.on('Send_Chat', async (homemessage) => {
        // status :- customer, driver

        console.log("Send_Chat");
        console.log(homemessage);
        
        const {sender_id, recevier_id, message, status} = homemessage;

        const hostname = socket.request.headers.host;
        const protocol = socket.request.connection.encrypted ? 'https' : 'http';
        let save_chat = await AllChat.Chat_Save(sender_id, sender_id, recevier_id, message, status, hostname, protocol);
        
        if (save_chat != false) {
            // let chat_list = await AllChat.AllChat(uid, sender_id, recevier_id, status, 1);
            
            socket.broadcast.emit(`New_Chat${recevier_id}`, { new_date: save_chat.today_date, id: save_chat.id, sender_id, message, date: save_chat.date });
        }
    })


    socket.on("disconnect", () => {
        // console.log("Socket disconnected");
    });


});

}




module.exports = { publicsocket };