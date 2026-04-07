/* jshint esversion: 6 */
/* jshint esversion: 8 */
/* jshint node: true */



const express = require("express");
const router = express.Router();
const axios = require('axios');
const { DataFind, DataInsert, DataUpdate, DataDelete } = require("../middleware/databse_query");

const URL = "http://192.168.1.12:3000" 

// ============= Paypal Payment ================ //
const paypal = require('paypal-rest-sdk');


async function ManagePayment(wamount, final_amount) {
    let price = 0;

    if (parseFloat(wamount) != 0) {
        if (parseFloat(wamount) < parseFloat(final_amount)) {
            price = parseFloat((parseFloat(final_amount) - parseFloat(wamount)).toFixed(2));
        } else price = parseFloat(final_amount);
    } else price = parseFloat(final_amount);

    return price
}

// Create a PayPal payment
router.get('/paypal-payment', async(req, res) => {
    try {
        const { amount, uid, request_id } = req.query;
        if ( !amount || !uid || !request_id) return res.status(200).json({ message: 'Data Not Found!', status:false});
    
        const payment_detail = await DataFind(`SELECT * FROM tbl_payment_detail WHERE id = '2'`);
        if (payment_detail == "") return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        let rd, finalamount = 0
        if (request_id != "0") {
            rd = await DataFind(`SELECT * FROM tbl_cart_vehicle WHERE id = '${request_id}' AND c_id = '${uid}'`);
            if (rd == "") return res.status(200).json({ message: 'Request Not Found!', status:false});
    
            finalamount = await ManagePayment(amount, rd[0].final_price);
        } else finalamount = parseFloat(amount);

        let pkey = payment_detail[0].attribute.split(",");
        if (pkey == "" || pkey == undefined) return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        const admin_data = await DataFind(`SELECT * FROM tbl_customer WHERE id = '${uid}'`);
        if (admin_data == "") return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        paypal.configure({
            mode: pkey[2], // sandbox or live
            client_id: pkey[0],
            client_secret: pkey[1]
        });
      
        const paymentData = {
            intent: 'sale',
            payer: {
                payment_method: 'paypal',
                payer_info: {
                    email: admin_data[0].email,
                    first_name: admin_data[0].name
                }
            },
            redirect_urls: {
                return_url: URL + "/payment/paypal-success",
                cancel_url: URL + "/payment/paypal-success"

                // return_url: req.protocol + req.hostname + "/payment/paypal-success",
                // cancel_url: req.protocol + req.hostname + "/payment/paypal-success"
            },
            transactions: [{
                amount: {
                    total: finalamount,
                    currency: 'USD'
                },
                description: "This is the payment description."
            }]
        };
      
        paypal.payment.create(paymentData, function (error, payment) {
            if (error) {
                // console.error('Error creating payment:', error);
                // return res.status(200).send({ message: 'Paypal Payment URL Not Generated!', status: false });
                res.redirect({ message: 'Paypal Payment URL Not Generated!', status: false });
            } else {
                const approvalUrl = payment.links.find(link => link.rel === 'approval_url').href;
                console.log(approvalUrl);
                // return res.status(200).send({ message: 'Paypal Payment URL Generate Successful', status: true, paypalURL: approvalUrl });
                res.redirect(approvalUrl);
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
  
// Execute a PayPal payment
router.get('/paypal-success', (req, res) => {
    try {
        const { paymentId, PayerID } = req.query;
        
        const executePaymentData = {
            payer_id: PayerID
        };
        
        paypal.payment.execute(paymentId, executePaymentData, (error, payment) => {
            if (error) {
                // console.error('Error executing payment:', error);
                return res.status(200).send({ message: 'Paypal Payment Cancel', status: false });
            } else {
                // console.log('Payment executed successfully:', payment);
                return res.status(200).send({ message: 'Paypal Payment Successful', status: true });
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});





// ============= Strip Payment ================ //

router.get('/strip-payment', async(req, res)=>{
    try {
        const { amount, uid, request_id } = req.query;
        if ( !amount || !uid || !request_id) return res.status(200).json({ message: 'Data Not Found!', status:false});
    
        const payment_detail = await DataFind(`SELECT * FROM tbl_payment_detail WHERE id = '3'`);
        if (payment_detail == "") return res.status(200).json({ message: 'Something Went Wrong!', status:false});
        
        let rd, finalamount = 0
        if (request_id != "0") {
            rd = await DataFind(`SELECT * FROM tbl_cart_vehicle WHERE id = '${request_id}' AND c_id = '${uid}'`);
            if (rd == "") return res.status(200).json({ message: 'Request Not Found!', status:false});
    
            finalamount = await ManagePayment(amount, rd[0].final_price);
        } else finalamount = parseFloat(amount);

        let pkey = payment_detail[0].attribute.split(",");
        if (pkey == "" || pkey == undefined) return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        const admin_data = await DataFind(`SELECT * FROM tbl_customer WHERE id = '${uid}'`);
        if (admin_data == "") return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        const stripe = require('stripe')(pkey[1]);

        // const dynamicPrice = amount * 100; 
        const dynamicPrice = Math.round(finalamount * 100);

        const price = await stripe.prices.create({
            unit_amount: dynamicPrice,
            currency: 'inr',
            product_data: {
                name: admin_data[0].name,
            },
        });

        const priceId = price.id;
        stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: "payment",
        line_items: [{
            price: priceId,
            quantity: 1,
        }],
        success_url: URL + "/payment/strip-success?payment_intent={CHECKOUT_SESSION_ID}",
        cancel_url: URL + "/payment/strip-cencal?payment_intent={CHECKOUT_SESSION_ID}",
        
        // success_url: req.protocol + req.hostname + "/payment/strip-success?payment_intent={CHECKOUT_SESSION_ID}",
        // cancel_url: req.protocol + req.hostname + "/payment/strip-cencal?payment_intent={CHECKOUT_SESSION_ID}",

        customer_email: "customer@example.com", // Replace this with dynamic customer email
    
        // Require Stripe to collect billing address at checkout
        billing_address_collection: 'required',

        }).then(session => {
            console.log('session data '+ session.url);
            // return res.status(200).send({ message: 'Stripe Payment URL Generate Successful', status: true, StripeURL: session.url });
            res.redirect(session.url);
        }).catch(error => {
            console.error("Error creating Stripe Checkout session:", error);
            // return res.status(200).send({ message: 'Stripe Payment URL Not Generated!', status: false });
            res.redirect({ message: 'Stripe Payment URL Not Generated!', status: false });

        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get("/strip-success", async(req, res)=>{
    try {
        const { payment_intent } = req.query;
        
        const payment_detail = await DataFind(`SELECT * FROM tbl_payment_detail WHERE id = '3'`);
        let pkey = payment_detail[0].attribute.split(",");

        const stripe = require('stripe')(pkey[1]);
        
        const session = await stripe.checkout.sessions.retrieve(payment_intent);
        const payment_intenta = session.payment_intent;

        let check = await stripe.paymentIntents.retrieve(payment_intenta);

        if (check.status == "succeeded") {   
            return res.status(200).send({ message: 'Stripe Payment Successful', status: true });
        } else {
            return res.status(200).send({ message: 'Stripe Payment Cancel!', status: false });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get("/strip-cencal", async(req, res)=>{
    try {
        const { payment_intent } = req.query;

        const payment_detail = await DataFind(`SELECT * FROM tbl_payment_detail WHERE id = '3'`);
        let pkey = payment_detail[0].attribute.split(",");
        const stripe = require('stripe')(pkey[1]);
        
        const session = await stripe.checkout.sessions.retrieve(payment_intent);

        const payment_intent_id = session.payment_intent;
        
        await stripe.paymentIntents.retrieve(payment_intent_id).catch(error => {
            // console.error("Error Stripe Checkout session: ", error);
            return res.status(200).send({ message: 'Stripe Payment Cancel!', status: false });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



// ============= Paystack Payment ================ //

router.get("/paystack-payment", async(req, res)=>{
    try {
        const { amount, uid, request_id } = req.query;
        if ( !amount || !uid || !request_id) return res.status(200).json({ message: 'Data Not Found!', status:false});

        const payment_detail = await DataFind(`SELECT * FROM tbl_payment_detail WHERE id = '4'`);
        if (payment_detail == "") return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        let rd, finalamount = 0
        if (request_id != "0") {
            rd = await DataFind(`SELECT * FROM tbl_cart_vehicle WHERE id = '${request_id}' AND c_id = '${uid}'`);
            if (rd == "") return res.status(200).json({ message: 'Request Not Found!', status:false});
    
            finalamount = await ManagePayment(amount, rd[0].final_price);
        } else finalamount = parseFloat(amount);

        let pkey = payment_detail[0].attribute.split(",");
        if (pkey == "" || pkey == undefined) return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        const admin_data = await DataFind(`SELECT * FROM tbl_customer WHERE id = '${uid}'`);
        if (admin_data == "") return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        const paystack = require('paystack')(pkey[1]);

        const options = {
            amount: finalamount * 100, 
            email: admin_data[0].email,
            name: admin_data[0].name,
            phone: admin_data[0].country_code + ' ' + admin_data[0].phone,
            callback_url: URL + "/payment/paystack-check",
            // callback_url: req.protocol + req.hostname + "/payment/paystack-check",
            metadata: {
                custom_fields: [
                    {
                        display_name: 'Order ID',
                        variable_name: 'order_id',
                        value: '12345'
                    }
                ]
            }
        };

        paystack.transaction.initialize(options, (error, body) => {
            if (!error) {
                const authorization_url = body.data.authorization_url;
                console.log('reference id:', body.data.reference);
                // return res.status(200).send({ message: 'Paystack Payment URL Generate Successful', status: true, PaystackURL: authorization_url });
                res.redirect(authorization_url);
            } else {
                // console.log(error);
                // return res.status(200).send({ message: 'Stripe Payment URL Not Generated!', status: false });
                res.redirect({ message: 'Stripe Payment URL Not Generated!', status: false });
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get("/paystack-check", async(req, res)=>{
    try {
        const reference = req.query.reference;

        const payment_detail = await DataFind(`SELECT * FROM tbl_payment_detail WHERE id = '4'`);
        let pkey = payment_detail[0].attribute.split(",");
        
        const paystackVerifyUrl = `https://api.paystack.co/transaction/verify/${reference}`;

        const headers = {
          'accept': 'application/json',
          'Authorization': `Bearer ${pkey[1]}`,
          'cache-control': 'no-cache'
        };

        axios
            .get(paystackVerifyUrl, { headers })
            .then((response) => {
            const data = response.data;
            if (data.status === true && data.data.status === 'success') {
                return res.status(200).send({ message: 'Paystack Payment Successful', status: true });

            } else {
                console.log('Transaction was Cancelled');
                return res.status(200).send({ message: 'Paystack Payment Cancel!', status: false });
                
            }
            }).catch((error) => {
                console.error('Error:', error);
                return res.status(200).send({ message: 'An error occurred!', status: false });
            });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});





// ============= Paystack Payment ================ //

router.get("/flutterwave-payment", async(req, res)=>{
    try {
        const { amount, uid, request_id } = req.query;
        if ( !amount || !uid || !request_id) return res.status(200).json({ message: 'Data Not Found!', status:false});

        let rd, finalamount = 0
        if (request_id != "0") {
            rd = await DataFind(`SELECT * FROM tbl_cart_vehicle WHERE id = '${request_id}' AND c_id = '${uid}'`);
            if (rd == "") return res.status(200).json({ message: 'Request Not Found!', status:false});
    
            finalamount = await ManagePayment(amount, rd[0].final_price);
        } else finalamount = parseFloat(amount);

        const payment_detail = await DataFind(`SELECT * FROM tbl_payment_detail WHERE id = '5'`);
        if (payment_detail == "") return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        let pkey = payment_detail[0].attribute.split(",");
        if (pkey == "" || pkey == undefined) return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        const admin_data = await DataFind(`SELECT * FROM tbl_customer WHERE id = '${uid}'`);
        if (admin_data == "") return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        const general_setting = await DataFind(`SELECT * FROM tbl_general_settings`);

        await axios.post("https://api.flutterwave.com/v3/payments", {
            tx_ref: Date.now(),
            amount: finalamount,
            currency: "NGN",
            redirect_url: URL + "/payment/flutterwave-check",
            // redirect_url: req.protocol + req.hostname + "/payment/flutterwave-check",
            customer: {
                email: admin_data[0].email,
                phonenumber: admin_data[0].country_code + ' ' + admin_data[0].phone,
                name: admin_data[0].name
            },
            customizations: {
                title: general_setting[0].title,
                logo: URL + general_setting[0].dark_image
                // logo: req.protocol + req.hostname + general_setting[0].dark_image
            }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer FLWSECK_TEST-c659ffd76304fff90fc4b67ae735b126-X`
            }
            // 'Authorization': `Bearer ${pkey[0]}`

        }).then(session => {
            console.log(session.data.data.link);
            // return res.status(200).send({ message: 'FlutterWave Payment URL Generate Successful', status: true, FlutterwaveURL: session.data.data.link });
            res.redirect(session.data.data.link);
        }).catch(error => {
            console.error("Error creating FlutterWave Checkout session:", error);
            // return res.status(200).send({ message: 'FlutterWave Payment URL Not Generated!', status: false });
            res.redirect({ message: 'FlutterWave Payment URL Not Generated!', status: false });
        });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



router.get("/flutterwave-check", async(req, res)=>{
    try {
        const tx_id = req.query.transaction_id;
        const status = req.query.status;

        if (status === 'successful') {

            const payment_detail = await DataFind(`SELECT * FROM tbl_payment_detail WHERE id = '5'`);
            if (payment_detail == "") return res.status(200).json({ message: 'Something Went Wrong!', status:false});
            
            let pkey = payment_detail[0].attribute.split(",");
            if (pkey == "" || pkey == undefined) return res.status(200).json({ message: 'Something Went Wrong!', status:false});


            await axios.get(`https://api.flutterwave.com/v3/transactions/${tx_id}/verify`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${pkey[0]}`
                }
            }).then(response => {
                if (response.data.data.status === 'successful') {
                    console.log("Flutterwave Payment Successful!");
                    return res.status(200).send({ message: 'Flutterwave Payment Successful', status: true });
                } else {
                    console.log("Flutterwave Payment Failed!");
                    return res.status(200).send({ message: 'Flutterwave Payment Failed!', status: false });
                }
                
            }).catch(error => {
                console.log("Flutterwave Payment Failed!", error);
                return res.status(200).send({ message: 'Flutterwave Payment Failed!', status: false });
            });
        } else {
            console.log("Transaction status not successful!");
            return res.status(200).send({ message: 'Transaction not successful!', status: false });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});





// ============= Senangpay Payment ================ //
const crypto = require("crypto");

router.get("/senangpay-payment", async(req, res)=>{
    try {
        const { amount, uid, request_id } = req.query;
        if ( !amount || !uid || !request_id) return res.status(200).json({ message: 'Data Not Found!', status:false});

        let rd, finalamount = 0
        if (request_id != "0") {
            rd = await DataFind(`SELECT * FROM tbl_cart_vehicle WHERE id = '${request_id}' AND c_id = '${uid}'`);
            if (rd == "") return res.status(200).json({ message: 'Request Not Found!', status:false});
    
            finalamount = await ManagePayment(amount, rd[0].final_price);
        } else finalamount = parseFloat(amount);

        const payment_detail = await DataFind(`SELECT * FROM tbl_payment_detail WHERE id = '6'`);
        if (payment_detail == "") return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        let pkey = payment_detail[0].attribute.split(",");
        if (pkey == "" || pkey == undefined) return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        const admin_data = await DataFind(`SELECT * FROM tbl_customer WHERE id = '${uid}'`);
        if (admin_data == "") return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        const MERCHANT_ID = pkey[0];
        const SECRET_KEY = pkey[1];
        
        const data = `${MERCHANT_ID}${Date.now()}${finalamount}${SECRET_KEY}`;
        const hash = crypto.createHash('sha256').update(data).digest('hex');
        
        let am = parseFloat(finalamount).toFixed(2);
        // Request payload
        const detail = {
            'detail': 'Shopping_cart_id_' + Date.now()+1,
            'amount': am,
            'order_id': Date.now(),
            'order_number': Date.now(),
            'name': admin_data[0].name,
            'email': admin_data[0].email,
            'phone': admin_data[0].phone,
            'hash': hash,
            'callback_url': URL + "/payment/senangpay-success"
            // 'callback_url': req.protocol + req.hostname + "/payment/senangpay-success"
        };

        // // All Payment Detail in One Link
        const paymentLink = `https://app.senangpay.my/payment/?${new URLSearchParams(detail).toString()}`;
        console.log(paymentLink);
        

        let action = "https://sandbox.senangpay.my/payment/"+ MERCHANT_ID +""; // // Sanbox
        // let action = "https://app.senangpay.my/payment/"+MERCHANT_ID+""; // // Live

        if (paymentLink) {
            console.log(paymentLink);
            // return res.status(200).send({ message: 'SenangPay Payment URL Generate Successful', status: true, SenangPayURL: paymentLink });
            res.redirect(paymentLink);
        } else {
            console.error("Error creating SenangPay Checkout session:", error);
            // return res.status(200).send({ message: 'SenangPay Payment URL Not Generated!', status: false });
            res.redirect({ message: 'SenangPay Payment URL Not Generated!', status: false });
        }

        // http://192.168.1.125:3000/payment/senangpay-payment?amount=100&uid=20&request_id=158

        // res.render("payment_form", {
        //     action, detail
        // });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get("/senangpay-success", async(req, res)=>{
    try {
        console.log(11111);
        
        return res.status(200).send({ message: 'Senangpay Payment Successful', status: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});





// ============= Payfast Payment ================ //

router.get("/payfast-payment", async(req, res)=>{
    try {
        const { amount, uid, request_id } = req.query;
        if ( !amount || !uid || !request_id) return res.status(200).json({ message: 'Data Not Found!', status:false});

        let rd, finalamount = 0
        if (request_id != "0") {
            rd = await DataFind(`SELECT * FROM tbl_cart_vehicle WHERE id = '${request_id}' AND c_id = '${uid}'`);
            if (rd == "") return res.status(200).json({ message: 'Request Not Found!', status:false});
    
            finalamount = await ManagePayment(amount, rd[0].final_price);
        } else finalamount = parseFloat(amount);

        const payment_detail = await DataFind(`SELECT * FROM tbl_payment_detail WHERE id = '7'`);
        if (payment_detail == "") return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        let pkey = payment_detail[0].attribute.split(",");
        if (pkey == "" || pkey == undefined) return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        const admin_data = await DataFind(`SELECT * FROM tbl_customer WHERE id = '${uid}'`);
        if (admin_data == "") return res.status(200).json({ message: 'Something Went Wrong!', status:false});
        
        console.log(pkey);

        const detail = {
            merchant_id: pkey[1],
            merchant_key: pkey[0],
            amount: finalamount,
            item_name: admin_data[0].name,
            email_address: admin_data[0].email,
            return_url: URL + "/payment/payfast-success",
            cancel_url: URL + "/payment/payfast-cancel",
            // return_url: req.protocol + req.hostname + "/payment/payfast-success",
            // cancel_url: req.protocol + req.hostname + "/payment/payfast-cancel",
        };
        
        // let action = "https://www.payfast.co.za/eng/process/"; // // live
        let action = "https://sandbox.payfast.co.za/eng/process/"; // // sendbox

        const paymentLink = `${action}?${new URLSearchParams(detail).toString()}`;
        
        if (paymentLink) {
            console.log(paymentLink);
            // return res.status(200).send({ message: 'Payfast Payment URL Generate Successful', status: true, PayfastURL: paymentLink });
            res.redirect(paymentLink);
        } else {
            console.error("Error creating FlutterWave Checkout session:", error);
            // return res.status(200).send({ message: 'Payfast Payment URL Not Generated!', status: false });
            res.redirect({ message: 'Payfast Payment URL Not Generated!', status: false });
        }

        // http://192.168.1.125:3000/payment/payfast-payment?amount=100&uid=20&request_id=158

        // res.render("payment_form", {
        //     action, detail
        // });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get("/payfast-success", async(req, res)=>{
    try {
        console.log("payfast successful");

        return res.status(200).send({ message: 'PayFast Payment Successful', status: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get("/payfast-cancel", async(req, res)=>{
    try {
        console.log("payfast cancel");
        
        return res.status(200).send({ message: 'PayFast Payment Failed!', status: false });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});





// ============= Midtrans Payment ================ //

const { Snap } = require('midtrans-client');

router.get("/midtrans-payment", async(req, res)=>{
    try {
        const { amount, uid, request_id } = req.query;
        if ( !amount || !uid || !request_id) return res.status(200).json({ message: 'Data Not Found!', status:false});

        let rd, finalamount = 0
        if (request_id != "0") {
            rd = await DataFind(`SELECT * FROM tbl_cart_vehicle WHERE id = '${request_id}' AND c_id = '${uid}'`);
            if (rd == "") return res.status(200).json({ message: 'Request Not Found!', status:false});
    
            finalamount = await ManagePayment(amount, rd[0].final_price);
        } else finalamount = parseFloat(amount);

        const payment_detail = await DataFind(`SELECT * FROM tbl_payment_detail WHERE id = '8'`);
        if (payment_detail == "") return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        let pkey = payment_detail[0].attribute.split(",");
        if (pkey == "" || pkey == undefined) return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        const admin_data = await DataFind(`SELECT * FROM tbl_customer WHERE id = '${uid}'`);
        if (admin_data == "") return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        const snap = new Snap({
            isProduction: false,
            serverKey: pkey[1],
            clientKey: pkey[0]
        });

        let am = parseFloat(finalamount);
        if (isNaN(am)) {
            return res.status(200).json({ message: 'Invalid amount!', status:false});
        }

        const isInteger = Number.isInteger(am); // Check if the amount is already an integer
        if (!isInteger) {
            am = Math.floor(am);
        }
        
        // Create a transaction
        const transactionDetails = {
            locale: "en",
            transaction_details: {
                order_id: `ORDER-${Date.now()}`,
                gross_amount: am.toString()
            },
            customer_details: {
            first_name: admin_data[0].name,
            email: admin_data[0].email,
            phone: admin_data[0].phone
            },
            credit_card: {
                secure: true
            },
            finish_payment_return_url: URL + "/payment/midtrans-success",
            error_payment_return_url: URL + "/payment/midtrans-cancel"

            // finish_payment_return_url: req.protocol + req.hostname + "/payment/midtrans-success",
            // error_payment_return_url: req.protocol + req.hostname + "/payment/midtrans-cancel"
        };
        
        snap.createTransaction(transactionDetails)
        .then(transactionToken => {
            // return res.status(200).send({ message: 'Midtrans Payment URL Generate Successful', status: true, MidtransURL: transactionToken.redirect_url });
            res.redirect(transactionToken.redirect_url);
        }).catch(error => {
            console.error("Error creating Midtrans Checkout session:", error.data);
            // return res.status(200).send({ message: 'Midtrans Payment URL Not Generated!', status: false });
            res.redirect({ message: 'Midtrans Payment URL Not Generated!', status: false });
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get("/midtrans-success", async(req, res)=>{
    try {
        const payment_detail = await DataFind(`SELECT * FROM tbl_payment_detail WHERE id = '8'`);
        if (payment_detail == "") return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        let pkey = payment_detail[0].attribute.split(",");
        if (pkey == "" || pkey == undefined) return res.status(200).json({ message: 'Something Went Wrong!', status:false});

        const orderId = req.query.order_id;

        const snap = new Snap({
            isProduction: false,
            serverKey: pkey[1],
            clientKey: pkey[0]
        });
    
        const transactionStatus = await snap.transaction.status(orderId);

        if (transactionStatus.transaction_status === 'settlement') {        
            res.status(200).json({ status: 'success' });
        } else {
            res.status(400).json({ status: 'failed', message: 'Payment was not successful' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get("/midtrans-cancel", async(req, res)=>{
    try {
        const payment_detail = await DataFind(`SELECT * FROM tbl_payment_detail WHERE id = '8'`);
        if (payment_detail == "") return res.status(200).json({ message: 'Something Went Wrong!', status:false});
        
        let pkey = payment_detail[0].attribute.split(",");
        if (pkey == "" || pkey == undefined) return res.status(200).json({ message: 'Something Went Wrong!', status:false});
    
        const orderId = req.query.order_id;
        // const orderId = "ORDER-1715150681164";
        console.log(orderId);
        console.log(111);
    
        const snap = new Snap({
            isProduction: false,
            serverKey: pkey[1],
            clientKey: pkey[0]
        });
        
        const transactionStatus = await snap.transaction.status(orderId);
    
        if (transactionStatus.transaction_status === 'settlement') {
            res.status(200).json({ status: 'success' });
        } else {
            res.status(400).json({ status: 'failed', message: 'Payment was not successful' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



// Paypal
// codekms@personal.example.com
// Kms@2020



// Paytm
// number :- 77777 77777
// password :- Paytm12345
// otp :- 489871



// Flutterwave
// 5531886652142950
// expiry:- 09/32
// cvv:- 564
// otp:- 12345
// pin:- 3310



// Stripe
// 4242 4242 4242 4242
// 12/34   // 123



// Paystack
// 4084 0840 8408 4081
// 01/26   // 408



// midtrans
// 4811 1111 1111 1114
// 01/25     123
// otp:- 112233



// senangpay
// number :- 5111111111111118
// expiry :-  May/2025
// cvv:- 100



// khalti
// ID :- 9800000000 9800000001 9800000002 9800000003 9800000004 9800000005
// MPIN :- 1111
// OTP :- 987654



// Mercado pago
// VISA :- 4509 9535 6623 3704
// security code :- 123
// EXP date :- 11/15

// MASTERCARD :- 5031 7557 3453 0604
// security code :- 123
// EXP date :- 11/15

// AMERICAN EXPRESS :- 3711 803032 57522
// security code :- 123
// EXP date :- 11/15



module.exports = router;