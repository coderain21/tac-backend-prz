/* eslint-disable no-tabs */
/* eslint-disable max-len */
module.exports.defaultTemplates = async () => {
    try {
        const registrationSuccess = `<!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <link rel="preconnect" href="https://fonts.googleapis.com">
                        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
                        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
                        <title>Auction Bid Confirmation</title>
                        <style>
                        @import url(https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap);

                        body {
                            font-family: Inter, sans-serif;
                            line-height: 1.6;
                            background-color: #E6E6E6;
                        }

                        .container {
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px 40px 20px 40px;
                            background-color: #FFFFFF;
                            border-radius: 10px;
                            margin-top: 36px;
                        }

                        .button {
                            display: inline-block;
                            width: 130px;
                            height: 46px;
                            padding: 10px 20px;
                            text-decoration: none;
                            background-color: #282828;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            margin-top: 10px;
                        }

                        .text {
                            font-size: 14px;
                            line-height: 16px;
                            text-align: center;
                        }

                        .header {
                            font-style: normal;
                            font-weight: 500;
                            font-size: 16px;
                            line-height: 19px;
                            color: black;
                        }

                        .dates {
                            font-size: 14px;
                            font-style: normal;
                            font-weight: 500;
                            color: #A1A1A9;
                            line-height: 15px;
                            padding-top: 8px;
                        }

                        .amount {
                            font-size: 14px;
                            font-style: normal;
                            font-weight: 500;
                            color: #343434;
                            line-height: 15px;
                        }

                        .auction_title {
                            font-size: 18px;
                            font-weight: 500;
                            line-height: 22px;
                            color: #343434;
                        }

                        .author_title {
                            /* left: calc(50% - 220px/2);
                            position: absolute; */
                            margin-top: 28px;
                            color: #A1A1A9;
                            line-height: 14px;
                            text-align: center;
                        }

                        .testName {
                            position: absolute;
                            width: 554px;
                            height: 200px;
                            left: calc(50% - 554px/2);
                            top: 152px;
                            color: #343434;
                        }

                        .auction {
                            display: flex;
                            /* justify-content: space-between; */
                            align-items: center;
                            border-radius: 8px;
                            padding-right: 20px;
                            padding-left: 0px;
                            margin-top: 20px;
                        }

                        .LOT {
                            /* justify-content: space-between; */
                            align-items: center;
                            border: 1px solid #E4E4E7;
                            border-radius: 8px;
                            padding-top: 0px;
                            padding-right: 20px;
                            padding-bottom: 13px;
                            padding-left: 20px;
                            margin-top: 20px;
                        }

                        .lot {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            border: 1px solid #E4E4E7;
                            border-radius: 8px;
                            padding: 30px 20px 20px 20px;
                            margin-top: 12px;
                        }

                        @media only screen and (max-width:748px) {
                            .lot {
                            display: block;
                            justify-content: space-between;
                            align-items: center;
                            border: 1px solid #E4E4E7;
                            border-radius: 8px;
                            padding: 10px 20px 10px 20px;
                            margin-top: 12px;
                            }
                                .box{
                                    font-size:48px; 
                                    line-height: 60px;
                                }
                                
                                .LOT {
                        
                            justify-content: space-between;
                            align-items: center;
                            border: 1px solid #E4E4E7;
                            border-radius: 8px;
                            padding-top: 10px;
                            padding-right: 5px !important;
                            padding-bottom: 10px;
                            padding-left: 5px;
                            margin-top: 20px;
                        }
                                .fontfame {
                                font-family: 'Inter', sans-serif !important;
                                font-style: normal;
                                font-weight: 500;
                                font-size: 14px !important;
                            }

                            .fonttext {
                                font-family: 'Inter', sans-serif !important;
                                font-style: normal;
                                font-weight: 500;
                                font-size: 16px !important;
                            }
                                
                                .small{
                                    padding-top:12px  !important;
                                    padding-bottom:12px  !important; 
                                    padding-left:16px  !important; 
                                    padding-right:16px  !important; 
                                    cursor:pointer !important;
                                }


                            .auction {
                            display: block;
                            justify-content: space-between;
                            align-items: center;
                            
                            border-radius: 8px;
                            padding: 10px 20px 10px 20px;
                            margin-top: 22px;
                            }

                        
                            .imageB {
                            padding-bottom: 20px;
                            margin-left: 0px !important;
                            display: inline-block;
                            margin-bottom: 10px;
                            margin-top: 12px;
                            }

                            .auction {
                            display: block;
                            /* justify-content: space-between; */
                            align-items: center;
                            
                            border-radius: 8px;
                            padding: 10px 10px 10px 10px;
                            margin-top: 22px;
                            }

                            .header {
                            font-style: normal;
                            font-weight: 500;
                            font-size: 12px;
                            line-height: 19px;
                            color: black;
                            }

                            .dates {
                            font-size: 10px !important;
                            font-style: normal;
                            font-weight: 500;
                            color: #A1A1A9;
                            line-height: 15px;
                            padding-top: 8px;
                            }

                            .amount {
                            font-size: 12px !important;
                            font-style: normal;
                            font-weight: 500;
                            color: #343434;
                            line-height: 15px;
                            }

                            .auction_title {
                            font-weight: 500;
                            line-height: 22px;
                            color: #343434;
                            }

                            .lasttitle {
                            margin-top: 10px;
                            }
                                .make{
                                    margin-top:30px;
                                }
                                
                                .fontbutton {
                            font-family: 'Inter', sans-serif !important;
                            font-style: normal;
                            font-weight: 500;
                            font-size: 12px !important;
                        }
                        }
                            

                        p {
                            margin: 0px !important;
                        }

                        span {
                            margin: 0px !important;
                        }
                            
                            .m_4961483068740794137{
                                
                                cursor:pointer;
                            }

                        .imageB {
                            padding-bottom: 10px;
                            margin-left: 20px;
                            display: inline-block;
                        }

                        .section {
                            padding-top: 25px;
                        }

                        .auctionLogo {
                            display: flex;
                            justify-content: center;
                            padding-top: 20px;
                        }

                        .footer {
                            padding-top: 10px;
                            color: black;
                        }

                        .Fname {
                            display: flex;
                        }

                        .span {
                            margin-right: 8px;
                        }

                        .fontfame {
                            font-family: 'Inter', sans-serif !important;
                            font-style: normal;
                            font-weight: 500;
                            font-size: 16px;
                        }

                        .fonttext {
                            font-family: 'Inter', sans-serif !important;
                            font-style: normal;
                            font-weight: 500;
                            font-size: 18px;
                        }

                        .fontbutton {
                            font-family: 'Inter', sans-serif !important;
                            font-style: normal;
                            font-weight: 500;
                            font-size: 14px;
                            cursor: pointer !important;
                        }

                        .a3s {
                            direction: initial;
                            font: Inter, sans-serif !important;
                            overflow-x: auto;
                            overflow-y: hidden;
                            position: relative;
                        }

                        .bid {
                            text-align: center;
                            font-family: Inter;
                            padding-left: 6px;
                            margin-left: 10px;
                            color: black;
                            font-size: 14px;
                            font-style: normal;
                            font-weight: 500;
                            color: #343434;
                            line-height: 15px;
                        }
                        </style>
                    </head>
                    <body>
                        <div class="container textName">
                        <div style="justify-content: center; padding-top: 20px;" vertical-align="middle" align="center">
                            <img src="*|logo|*" alt="auction" style="width:100px; height:auto;object-fit:contain;"/>
                        </div>
                        <div class="header section">
                            <div class="Fname">
                            <p class="span fontfame" style="color:black;">Dear </p>
                            <p style="padding-left:6px;color:black;" class="fontfame">*|user_first_name|*</p>
                            <p>,</p>
                            </div>
                            <p style="padding-top:20px;color:black;" class="fontfame">Congratulations, you are now registered to bid in the auction.</p>
                        
                        </div>
                        <div class="LOT">
                            
                            
                            <div class="auction">
                            
                                <div class="imageA">
                                    <a href="*|domainURL|*">  <img src="*|auction_image|*" alt="image" width="200" style="max-height:200px;object-fit:contain;"/></a>
                                </div>
                            
                            
                                    <div class="imageB">
                                        <div>
                                                <span class="auction_title fontfame">
                                                    <p class="fonttext" style=" font-family: 'Inter', sans-serif;color:black;word-break:break-all;">*|Auction_title|*</p>
                                                </span>
                                            <p class="dates">
                                                    <span>Auction ends: *|auction_end_date|*</span>
                                                </p>
                                        </div>
                                        <div style="display:inline-grid; margin-top:55px;">
                                            <a href="*|domainURL|*" style="text-decoration:none;" class="fontbutton">  <span style="background-color: #282828; color: #fff; padding-top:16px;padding-bottom:16px; padding-left:31px; padding-right:31px; text-decoration: none; border-radius: 6px; margin-bottom:10px;margin-top:10px;" class="buttonView">View Auction</span></a>
                                        </div>
                                        
                                    </div>
                        </div>
                        </div>
                            <p style="padding-top:20px;color:black;" class="fontfame">Your paddle number is attached. It is unique to you and this auction.</p>
                            
                            <div style="display:flex;margin-top: 30px; margin-bottom: 20px;">
                                <div style="background-color: *|background_color|*; width: 400px; height:200px;text-align: center; margin-left: auto; margin-right: auto; border-radius: 6px; font-family: 'Inter', sans-serif;color:white;word-break:break-all;font-size:68px; line-height: 80px; text-align: center;" align="middile">
                                    
                                                <p style="text-align: center; padding-top: 55px;
                        padding-bottom: 55px;">*|paddle|*</p>  
                                                
                                </div>
                            </div>
                            
                            
                        <p class="header footer fontfame" style="padding-top:20px;">For any questions, please contact *|Seller_email|*.</p>
                        <p class="header footer fontfame">All our best, <br>
                        </p>
                        <p class="fontfame" style="color:black;">*|Seller_name|*</p>
                        </div>
                        <p class="author_title" style="padding-top:10px;">Powered by Indy.auction</p>
                    </body>
                    </html>`

        const otpHtml = `<!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="X-UA-Compatible" content="IE=edge">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Otp Template For Buyer Registration</title>
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,300;1,400;1,700;1,900&family=Noto+Sans:wght@300;400;500&family=Nunito:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;0,1000;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900;1,1000&family=Roboto:wght@100;400;500&display=swap" rel="stylesheet">
                <style>
                    body{
                        background: #E6E6E6;
                        font-family: 'Inter', sans-serif !important;
                    }
                    .indy-logo{
                        margin: 48px auto 0px;
                        text-align: center;
                        cursor: pointer;
                    }
                    .maincontent{
                        background: #FFFFFF;
                        max-width: 666px;
                        height: auto;
                        margin: 40px auto;
                        border-radius: 10px;
                        font-family: 'Inter', sans-serif !important;
                    }
                
                    .headersection{
                        text-align: center;
                        padding: 56px 0px;
                        background-color: white;
                        border-radius: 6px;
                        font-family: 'Inter', sans-serif !important;
                    }
                    .heading-con{
                        font-size: 22px;
                        line-height: normal;
                        color: #343434;
                        font-style: medium;
                        font-weight: 500;
                        margin:0px;
                        font-family: 'Inter', sans-serif !important;
                    }
                    .paragraph{
                        font-size: 18px;
                        font-style: normal;
                        font-weight: 500;
                        line-height: normal;
                        color:#A1A1A9;
                        text-align: center;
                        padding:0px 132px;
                        font-family: 'Inter', sans-serif !important;
                    }
                    .note-main{
                        margin: 0px !important;
                        padding: 0px;
                        font-family: 'Inter', sans-serif !important;
                    }
                    .note-con{
                        font-size: 14px;
                        font-style: normal;
                        font-weight: 500;
                        line-height: normal;
                        color:#A1A1A9;
                        font-family: 'Inter', sans-serif !important;
                    }
                    .otp-con{
                        font-size: 56px;
                        font-style: normal;
                        font-weight: 700;
                        line-height: normal;
                        margin:40px 0px 28px;
                        font-family: 'Inter', sans-serif !important;
                    }
                    .validcode{
                        font-size: 18px;
                        font-style: normal;
                        font-weight: 500;
                        line-height: normal;
                        color:#343434;
                        margin-bottom: 40px;
                        font-family: 'Inter', sans-serif !important;
                    }
                    .indy-link{
                        font-size: 14px;
                        font-style: normal;
                        font-weight: 500;
                        line-height: normal;
                        text-decoration-line: underline;
                        color:#343434 !important;
                        cursor: pointer;
                        font-family: 'Inter', sans-serif !important;
                    }
                    .footer-con{
                        margin:22px auto 0px;
                        text-align: center;
                        font-family: 'Inter', sans-serif !important;
                    }
                    .insta-icon{
                        margin-right:16px;
                        cursor: pointer;
                        font-family: 'Inter', sans-serif !important;
                    }
                    .linkedin-icon{
                        cursor: pointer;
                    }
                    .facebook-icon{
                        margin-right:16px;
                        cursor: pointer;
                    }
                    .twitter-icon{
                        margin-right:16px;
                        cursor: pointer;
                    }
                    .footer-content{
                        font-size: 10px;
                        font-style: normal;
                        font-weight: 500;
                        line-height: normal;
                        color:#A1A1A9;
                        font-family: 'Inter', sans-serif !important;
                    }
                    @media(max-width:575px){
                        .headersection{
                            padding: 22px 20px 40px 20px;
                            background-color: white;
                            border-radius: 6px;
                        }
                        .heading-con{
                            font-size: 20px;
                        }
                        .paragraph{
                            font-size: 16px;
                            padding: 0px;
                        }
                        .otp-con{
                            margin:24px;
                            font-size: 38px;
                        }
                        .validcode{
                            font-size: 16px;
                            margin-bottom: 20px;
                        }
                        .main-content{
                            margin: 120px auto;
                        }
                        .note-con{
                            font-size: 13px; 
                        }
                    }
                </style>
            </head>
            <body>
                <div class="indy-logo">
                <a href="#"><img  src=*|logo_image|* alt="img" style="width: 100px; height: auto"></a> 
                </div>
                <div class="maincontent">
                    <div class="headersection">
                        <P class="heading-con">Thank you for joining Indy</P>
                        <p class="paragraph">Please verify your email address by using the 6-digit code below.</p>
                        <p class="otp-con">*|otp|*</p>
                        <p class="validcode">This code is valid for 10 minutes.</p>
                        <div class="note-main">
                            <p class="note-con" style="margin-top: 25px;">If you did not register this address, please contact <a href="#" class="indy-link">support@indy.auction</a></p>
                        </div>
                    </div>
                </div>
            </body>
                </html>`

        const congratulationsHtml = `<!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <link rel="preconnect" href="https://fonts.googleapis.com">
                        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
                        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
                        <title>Auction Bid Confirmation</title>
                        <style>
                            @import url(https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap);
                        body {
                            font-family: Inter, sans-serif;
                            line-height: 1.6;
                            background-color: #E6E6E6;
                        }

                        .container {
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px 40px 20px 40px;
                            background-color: #FFFFFF;
                            border-radius: 10px;
                            margin-top: 36px;
                        }

                        .button {
                            display: inline-block;
                            width: 130px;
                            height: 46px;
                            padding: 10px 20px;
                            text-decoration: none;
                            background-color: #282828;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            margin-top: 10px;
                        }

                        .text {
                            font-size: 14px;
                            line-height: 16px;
                            text-align: center;
                        }

                        .header {
                            font-style: normal;
                            font-weight: 500;
                            font-size: 16px;
                            line-height: 19px;
                            color:black;
                        }

                        .dates {
                            font-size: 14px;
                            font-style: normal;
                            font-weight: 500;
                            color: #A1A1A9;
                            line-height: 15px;
                            padding-top:8px;
                        }

                        .amount {
                            font-size: 14px;
                            font-style: normal;
                            font-weight: 500;
                            color: #343434;
                            line-height: 15px;
                        }

                        .auction_title {
                            font-size: 18px;
                            font-weight: 500;
                            line-height: 22px;
                            color: #343434;
                        }

                        .author_title {
                            /* left: calc(50% - 220px/2);
                            position: absolute; */
                            margin-top: 28px;
                            color: #A1A1A9;
                            font-size: 12px;
                            line-height: 14px;
                            text-align: center;
                        }

                        .testName {
                            position: absolute;
                            width: 554px;
                            height: 200px;
                            left: calc(50% - 554px/2);
                            top: 152px;
                            color: #343434;
                        }

                        .auction {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            border: 1px solid #E4E4E7;
                            border-radius: 8px;
                            padding-top:10px;
                            padding-right:20px; 
                            padding-bottom:10px;
                            padding-left:20px;
                            margin-top:20px;
                        
                        
                        }

                        .lot {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            border: 1px solid #E4E4E7;
                            border-radius: 8px;
                            padding: 10px 20px 10px 20px;
                            margin-top: 12px;
                            
                        }
                            
                            @media only screen and (max-width:748px){
                            
                                    .lot {
                                    display: block;
                                    justify-content: space-between;
                                    align-items: center;
                                    border: 1px solid #E4E4E7;
                                    border-radius: 8px;
                                    padding: 10px 20px 10px 20px;
                                    margin-top: 12px;
                                        
                                }
                                
                                .auction {
                                        display: block;
                                        justify-content: space-between;
                                        align-items: center;
                                        border: 1px solid #E4E4E7;
                                        border-radius: 8px;
                                        padding: 10px 20px 10px 20px;
                                        margin-top: 22px;
                                    }
                                
                                .fonttext {
                                        font-family: Inter, sans-serif !important;
                                        font-style: normal;
                                        font-weight: 500;
                                        font-size:14px;
                                        color:black;
                                    
                                            }      
                                .imageB {
                            
                                        padding-bottom: 20px;
                                        margin-left:0px !important;
                                        display:inline-block;
                                    margin-bottom:10px;
                                                margin-top: 12px;
                                                    
                                        }
                                .auction {
                                        display: block;
                                        justify-content: space-between;
                                        align-items: center;
                                        border: 1px solid #E4E4E7;
                                        border-radius: 8px;
                                        padding: 10px 20px 10px 20px;
                                        margin-top: 22px;
                                }
                                
                                
                                .header {
                            font-style: normal;
                            font-weight: 500;
                            font-size: 12px;
                            line-height: 19px;
                            color:black;
                        }

                        .dates {
                            font-size: 10px !important;
                            font-style: normal;
                            font-weight: 500;
                            color: #A1A1A9;
                            line-height: 15px;
                            padding-top:8px;
                        }

                        .amount {
                            font-size: 12px !important;
                            font-style: normal;
                            font-weight: 500;
                            color: #343434;
                            line-height: 15px;
                        }

                        .auction_title {
                            font-size: 14px !important;
                            font-weight: 500;
                            line-height: 22px;
                            color: #343434;
                        }
                        
                                
                                .lasttitle{
                                    
                                    margin-top:10px;
                                }
                                
                        
                                
                        
                                
                        
                        }
                            
                            p{
                            margin:0px !important;
                        }
                        span{
                            margin:0px !important;
                        }
                        

                        

                        .imageB {
                            
                            padding-bottom: 10px;
                            margin-left:20px;
                            display:inline-block;
                        }

                        .section {
                            padding-top: 25px;
                        }

                        .auctionLogo {
                            display: flex;
                            justify-content: center;
                            padding-top: 20px;
                        }

                        .footer {
                            padding-top: 10px;
                            color:black;
                        }

                        .Fname {
                            display: flex;
                        }

                        .span {
                            margin-right: 8px;
                        }

                        .fontfame {
                            font-family: 'Inter', sans-serif !important;
                            font-style: normal;
                            font-weight: 500;
                            font-size:16px;
                        }
                            .fonttext {
                            font-family: 'Inter', sans-serif !important;
                            font-style: normal;
                            font-weight: 500;
                            font-size:18px;
                        }
                            .fontbutton{
                                font-family: 'Inter', sans-serif !important;
                            font-style: normal;
                            font-weight: 500;
                            font-size:14px;
                            }

                        .a3s {
                            direction: initial;
                            font: Inter, sans-serif !important;
                            overflow-x: auto;
                            overflow-y: hidden;
                            position: relative;
                        }
                            
                            .bid{
                                text-align:center;
                                font-family:Inter;
                                padding-left:6px;
                                margin-left:10px;
                                color:black;
                                font-size: 14px;
                            font-style: normal;
                            font-weight: 500;
                            color: #343434;
                            line-height: 15px;
                            } 
                            
                        </style>
                    </head>
                    <body>
                        <div class="container textName">
                            <div style="justify-content: center; padding-top: 20px;" vertical-align="middle" align="center">
                                <img src="*|LOGO_URL|*" alt="auction" style="width:100px; height:auto;object-fit:contain;"/>
                        </div>
                            
                        <div class="header section">
                            <div class="Fname">
                                <p class="span fontfame" style="color:black;">Dear </p>
                                <p style="padding-left:6px;color:black;" class="fontfame">*|user_first_name|*</p>
                            <p>,</p>
                            </div>
                            
                            
                            <p style="padding-top:20px;color:black;" class="fontfame">Thank you for placing your bid. In case you want to increase your maximum bid, you can do so at the auction page. The highest bidder when the countdown timer ends, wins the auction.</p>
                            <div style="padding-top:20px; color:black;" class="fontfame"><span>*|EXTENSION_CONTENT|*</span>
                            </div>
                            <p style="padding-top:20px;color:black;" class="fontfame">Fingers crossed and best of luck.</p>

                        </div>
                            
                            
                        <div class="auction" style="flex-wrap:wrap">
                            
                                <div class="imageA">
                                    <a href="*|AUCTION_URL|*">  <img src="*|AUCTION_IMAGE|*" width="200" style="max-height:200px;object-fit:contain;" alt="image"/></a>
                                </div>
                            
                            
                                    <div class="imageB">
                                        <div>
                                                <span class="auction_title fontfame">
                                                    <p class="fonttext" style=" font-family: 'Inter', sans-serif;color:black;word-break:break-all;">*|AUCTION_TITLE|*</p>
                                                </span>
                                                <p class="dates">
                                                    <span>Auction ends: *|AUCTION_DATE|*</span>
                                                </p>
                                        </div>
                                        <div style="display:inline-grid;margin-top:55px;">
                                        <a href="*|AUCTION_URL|*" style="text-decoration:none;"><span style="background-color: #282828; color: #fff; padding-top:16px;padding-bottom:16px; padding-left:31px; padding-right:31px; text-decoration: none; border-radius: 6px; margin-bottom:10px;margin-top:10px;" class="fontbutton">View Auction </span> </a>
                                        </div>
                                    </div>
                        </div>
                            
                            
                            
                            
                            
                        <div class="lot" style="flex-wrap:wrap">
                                    <div class="imageA">
                                        <a href="*|LOT_REDIRECTION_URL|*"><img src="*|LOT_IMAGE|*" width="200" style="max-height:200px;object-fit:contain;" alt="lot-Image"/></a>
                                    
                                    </div>
                                    <div class="imageB">
                                        <div style="height:100%;">
                                            <span class="auction_title fontfame">
                                                <p class="span fonttext" style="color:black;word-break:break-all;">*|LOT_NUMBER|*. *|LOT_TITLE|*</p>
                                            </span>
                                            
                                            <div style="display:flex; justify-content:space-between; align:center; padding-top:8px;color:black;">
                                            <p class="amount" style="font-family:Inter;color:black;">Bid Amount: </p>
                                            <p class="bid">*|BID_AMOUNT|*</p>
                                </div>
                                
                                        </div>    
                                        
                                    </div>
                            
                                    
                        
                        </div>
                            
                            
                            
                            <p class="header footer fontfame" style="padding-top:20px;">For any questions, please contact *|SELLER_EMAIL|*</p>
                        <p class="header footer fontfame">All our best, <br> </p>
                            <p class="fontfame" style="color:black;">*|SELLER_NAME|*</p>
                            <p class="author_title" style="padding-top:10px;">Powered by Indy.auction</p>
                        </div>
                    </body>
                    </html>`

        const paymentRecieptHtml = `<!DOCTYPE html>
                            <html lang="en">
                            <head>
                                <meta charset="UTF-8">
                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                <link rel="preconnect" href="https://fonts.googleapis.com">
                                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
                                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
                                <title>Auction Bid Confirmation</title>
                                <style>
                                @import url(https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap);

                                body {
                                    font-family: Inter, sans-serif;
                                    line-height: 1.6;
                                    background-color: #E6E6E6;
                                }

                                .container {
                                    max-width: 600px;
                                    margin: 0 auto;
                                    padding: 20px 40px 40px 40px;
                                    background-color: #FFFFFF;
                                    border-radius: 10px;
                                    margin-top: 36px;
                                }

                                .button {
                                    display: inline-block;
                                    width: 130px;
                                    height: 46px;
                                    padding: 10px 20px;
                                    text-decoration: none;
                                    background-color: #282828;
                                    color: white;
                                    border: none;
                                    border-radius: 6px;
                                    margin-top: 10px;
                                }

                                .text {
                                    font-size: 14px;
                                    line-height: 16px;
                                    text-align: center;
                                }

                                .header {
                                    font-style: normal;
                                    font-weight: 500;
                                    font-size: 16px;
                                    line-height: 19px;
                                    color: black;
                                }

                                .dates {
                                    font-size: 14px;
                                    font-style: normal;
                                    font-weight: 500;
                                    color: #A1A1A9;
                                    line-height: 15px;
                                    padding-top: 8px;
                                }

                                .amount {
                                    font-size: 14px;
                                    font-style: normal;
                                    font-weight: 500;
                                    color: #343434;
                                    line-height: 15px;
                                }

                                .auction_title {
                                    font-size: 18px;
                                    font-weight: 500;
                                    line-height: 22px;
                                    color: #343434;
                                }

                                .author_title {
                                    /* left: calc(50% - 220px/2);
                                    position: absolute; */
                                    margin-top: 28px;
                                    color: #A1A1A9;
                                    line-height: 14px;
                                    text-align: center;
                                }

                                .testName {
                                    position: absolute;
                                    width: 554px;
                                    height: 200px;
                                    left: calc(50% - 554px/2);
                                    top: 152px;
                                    color: #343434;
                                }

                                .auction {
                                    display: flex;
                                    justify-content: space-between;
                                    align-items: center;
                                    border-radius: 8px;
                                    padding-top: 10px;
                                    padding-right: 20px;
                                    padding-bottom: 10px;
                                    padding-left: 20px;
                                    margin-top: 20px;
                                }

                                .LOT {
                                    justify-content: space-between;
                                    align-items: center;
                                    border: 1px solid #E4E4E7;
                                    border-radius: 8px;
                                    /* padding-top: 10px; */
                                    padding-right: 20px;
                                    padding-bottom: 10px;
                                    padding-left: 20px;
                                    margin-top: 20px;
                                }

                                .lot {
                                    display: flex;
                                    justify-content: space-between;
                                    align-items: center;
                                    border: 1px solid #E4E4E7;
                                    border-radius: 8px;
                                    padding: 25px 20px 25px 20px;
                                    margin-top: 12px;
                                }

                                @media only screen and (max-width:748px) {
                                    .lot {
                                    display: block;
                                    justify-content: space-between;
                                    align-items: center;
                                    border: 1px solid #E4E4E7;
                                    border-radius: 8px;
                                    padding: 10px 20px 10px 20px;
                                    margin-top: 12px;
                                    }
                                        .fontfame {
                                        font-family: 'Inter', sans-serif !important;
                                        font-style: normal;
                                        font-weight: 500;
                                        font-size: 14px !important;
                                    }

                                    .fonttext {
                                        font-family: 'Inter', sans-serif !important;
                                        font-style: normal;
                                        font-weight: 500;
                                        font-size: 16px !important;
                                    }
                                        
                                        .small{
                                            padding-top:12px  !important;
                                            padding-bottom:12px  !important; 
                                            padding-left:16px  !important; 
                                            padding-right:16px  !important; 
                                            cursor:pointer !important;
                                        }


                                    .auction {
                                    display: block;
                                    justify-content: space-between;
                                    align-items: center;
                                    
                                    border-radius: 8px;
                                    padding: 10px 20px 10px 20px;
                                    margin-top: 22px;
                                    }

                                
                                    .imageB {
                                    padding-bottom: 20px;
                                    margin-left: 0px !important;
                                    display: inline-block;
                                    margin-bottom: 10px;
                                    margin-top: 12px;
                                    }

                                    .auction {
                                    display: block;
                                    justify-content: space-between;
                                    align-items: center;
                                    
                                    border-radius: 8px;
                                    padding: 10px 20px 10px 20px;
                                    margin-top: 22px;
                                    }

                                    .header {
                                    font-style: normal;
                                    font-weight: 500;
                                    font-size: 12px;
                                    line-height: 19px;
                                    color: black;
                                    }

                                    .dates {
                                    font-size: 10px !important;
                                    font-style: normal;
                                    font-weight: 500;
                                    color: #A1A1A9;
                                    line-height: 15px;
                                    padding-top: 8px;
                                    }

                                    .amount {
                                    font-size: 12px !important;
                                    font-style: normal;
                                    font-weight: 500;
                                    color: #343434;
                                    line-height: 15px;
                                    }

                                    .auction_title {
                                    font-weight: 500;
                                    line-height: 22px;
                                    color: #343434;
                                    }

                                    .lasttitle {
                                    margin-top: 10px;
                                    }
                                        .make{
                                            margin-top:30px;
                                        }
                                        
                                        .fontbutton {
                                    font-family: 'Inter', sans-serif !important;
                                    font-style: normal;
                                    font-weight: 500;
                                    font-size: 12px !important;
                                }
                                }
                                    

                                p {
                                    margin: 0px !important;
                                }

                                span {
                                    margin: 0px !important;
                                }
                                    
                                    .m_4961483068740794137{
                                        
                                        cursor:pointer;
                                    }

                                .imageB {
                                    padding-bottom: 10px;
                                    margin-left: 20px;
                                    display: inline-block;
                                }

                                .section {
                                    padding-top: 25px;
                                }

                                .auctionLogo {
                                    display: flex;
                                    justify-content: center;
                                    padding-top: 20px;
                                }

                                .footer {
                                    color: black;
                                }

                                .Fname {
                                    display: flex;
                                }

                                .span {
                                    margin-right: 8px;
                                }

                                .fontfame {
                                    font-family: 'Inter', sans-serif !important;
                                    font-style: normal;
                                    font-weight: 500;
                                    font-size: 16px;
                                }

                                .fonttext {
                                    font-family: 'Inter', sans-serif !important;
                                    font-style: normal;
                                    font-weight: 500;
                                    font-size: 18px;
                                }

                                .fontbutton {
                                    font-family: 'Inter', sans-serif !important;
                                    font-style: normal;
                                    font-weight: 500;
                                    font-size: 14px;
                                    cursor: pointer !important;
                                }

                                .a3s {
                                    direction: initial;
                                    font: Inter, sans-serif !important;
                                    overflow-x: auto;
                                    overflow-y: hidden;
                                    position: relative;
                                }

                                .bid {
                                    text-align: center;
                                    font-family: Inter;
                                    padding-left: 6px;
                                    margin-left: 10px;
                                    color: black;
                                    font-size: 14px;
                                    font-style: normal;
                                    font-weight: 500;
                                    color: #343434;
                                    line-height: 15px;
                                }
                                </style>
                            </head>
                            <body>
                                <div class="container textName">
                                <div style="justify-content: center; padding-top: 20px;" vertical-align="middle" align="center">
                                    <img src="*|logo_image|*" alt="auction" style="width:100px; height:auto;object-fit:contain;"/>
                                </div>
                                <div class="header section">
                                    <div class="Fname">
                                    <p class="span fontfame" style="color:black;">Dear </p>
                                    <p style="padding-left:6px;color:black;" class="fontfame">*|user_first_name|*</p>
                                    <p>,</p>
                                    </div>
                                    <p style="padding-top:20px;color:black;" class="fontfame">Thank you for completing your purchase from [Auction title] [end date]  and our congratulations to you.</p>
                                    <div style="padding-top:20px; color:black;" class="fontfame">
                                    <p style="padding-top:20px;color:black;" class="fontfame">Please find receipt of your payment below:</p>
                                    <p style="padding-top:10px;color:black;" class="fontfame">*|user_first_name|*</p>
                                    <p style="padding-top:10px;color:black;" class="fontfame">*|billing_address|*</p>
                                    <p style="padding-top:10px;color:black;" class="fontfame">*|buyer_email|*</p>
                                    </div>
                                </div>
                                <div class="LOT">
                                    <div class="auction">
                                    <div class="imageA">
                                        <a href="*|AUCTION_URL|*">
                                        <img src="*|auction_image|*" width="200" style="max-height:200px;object-fit:contain;" alt="image"/>
                                        </a>
                                    </div>
                                    <div class="imageB">
                                        <div style="height:100%;">
                                        <span class="auction_title">
                                            <p class="span fonttext" style="color:black;word-break:break-all;">*|lot_title|*</p>
                                        </span>
                                        <div style="display:flex; justify-content:space-between; align:center; padding-top:8px;color:black;">
                                            <p class="amount" style="font-family:Inter;color:black;">Bid Amount: </p>
                                            <p class="bid">*|bid_amount|*</p>
                                        </div>
                                        </div>
                                    </div>
                                    </div>
                                </div>
                                    <div class="lot" style=" flex-wrap: wrap;">
                                    <div style="display:flex;color:black;">
                                        <p class="amount" style="font-family:Inter;color:black;">Total paid:</p>
                                        <p class="bid">*|total_amount|*</p>
                                    </div>
                                    </div>

                                <p class="header footer fontfame" style="padding-top:20px;">We will be in touch shortly to arrange the collection or delivery.</p>
                                <p class="header footer fontfame" style="padding-top:20px;">Many thanks and congratulations once again on the new purchase.</p>

                                    
                                <p class="header footer fontfame" style="padding-top: 30px;">All our best, <br>
                                </p>
                                <p class="fontfame" style="color:black;padding-top: 10px;">*|seller_name|*</p>
                                </div>
                                <p class="author_title" style="padding-top:10px;">Powered by Indy.auction</p>
                            </body>
                            </html>`

        const winningBidHtml = `<!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <link rel="preconnect" href="https://fonts.googleapis.com">
                        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
                        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
                        <title>Auction Bid Confirmation</title>
                        <style>
                            @import url(https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap);
                        body {
                            font-family: Inter, sans-serif;
                            line-height: 1.6;
                            background-color: #E6E6E6;
                        }

                        .container {
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px 40px 20px 40px;
                            background-color: #FFFFFF;
                            border-radius: 10px;
                            margin-top: 36px;
                        }

                        .button {
                            display: inline-block;
                            width: 130px;
                            height: 46px;
                            padding: 10px 20px;
                            text-decoration: none;
                            background-color: #282828;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            margin-top: 10px;
                        }

                        .text {
                            font-size: 14px;
                            line-height: 16px;
                            text-align: center;
                        }

                        .header {
                            font-style: normal;
                            font-weight: 500;
                            font-size: 16px;
                            line-height: 19px;
                            color:black;
                        }

                        .dates {
                            font-size: 14px;
                            font-style: normal;
                            font-weight: 500;
                            color: #A1A1A9;
                            line-height: 15px;
                            padding-top:8px;
                        }

                        .amount {
                            font-size: 14px;
                            font-style: normal;
                            font-weight: 500;
                            color: #343434;
                            line-height: 15px;
                        }

                        .auction_title {
                            font-size: 18px;
                            font-weight: 500;
                            line-height: 22px;
                            color: #343434;
                        }

                        .author_title {
                            /* left: calc(50% - 220px/2);
                            position: absolute; */
                            margin-top: 28px;
                            color: #A1A1A9;
                            font-size: 12px;
                            line-height: 14px;
                            text-align: center;
                        }

                        .testName {
                            position: absolute;
                            width: 554px;
                            height: 200px;
                            left: calc(50% - 554px/2);
                            top: 152px;
                            color: #343434;
                        }

                        .auction {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            border: 1px solid #E4E4E7;
                            border-radius: 8px;
                            padding-top:10px;
                            padding-right:20px; 
                            padding-bottom:10px;
                            padding-left:20px;
                            margin-top:20px;
                        
                        
                        }

                        .lot {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            border: 1px solid #E4E4E7;
                            border-radius: 8px;
                            padding: 10px 20px 10px 20px;
                            margin-top: 12px;
                            
                        }
                            
                            @media only screen and (max-width:748px){
                            
                                    .lot {
                                    display: block;
                                    justify-content: space-between;
                                    align-items: center;
                                    border: 1px solid #E4E4E7;
                                    border-radius: 8px;
                                    padding: 10px 20px 10px 20px;
                                    margin-top: 12px;
                                        
                                }
                                
                                .auction {
                                        display: block;
                                        justify-content: space-between;
                                        align-items: center;
                                        border: 1px solid #E4E4E7;
                                        border-radius: 8px;
                                        padding: 10px 20px 10px 20px;
                                        margin-top: 22px;
                                    }
                                
                                .fonttext {
                                        font-family: Inter, sans-serif !important;
                                        font-style: normal;
                                        font-weight: 500;
                                        font-size:14px;
                                        color:black;
                                    
                                            }      
                                .imageB {
                            
                                        padding-bottom: 20px;
                                        margin-left:0px !important;
                                        display:inline-block;
                                    margin-bottom:10px;
                                                margin-top: 12px;
                                                    
                                        }
                                .auction {
                                        display: block;
                                        justify-content: space-between;
                                        align-items: center;
                                        border: 1px solid #E4E4E7;
                                        border-radius: 8px;
                                        padding: 10px 20px 10px 20px;
                                        margin-top: 22px;
                                }
                                
                                
                                .header {
                            font-style: normal;
                            font-weight: 500;
                            font-size: 12px;
                            line-height: 19px;
                            color:black;
                        }

                        .dates {
                            font-size: 10px !important;
                            font-style: normal;
                            font-weight: 500;
                            color: #A1A1A9;
                            line-height: 15px;
                            padding-top:8px;
                        }

                        .amount {
                            font-size: 12px !important;
                            font-style: normal;
                            font-weight: 500;
                            color: #343434;
                            line-height: 15px;
                        }

                        .auction_title {
                            font-size: 14px !important;
                            font-weight: 500;
                            line-height: 22px;
                            color: #343434;
                        }
                        
                                
                                .lasttitle{
                                    
                                    margin-top:10px;
                                }
                                
                        
                                
                        
                                
                        
                        }
                            
                            p{
                            margin:0px !important;
                        }
                        span{
                            margin:0px !important;
                        }
                        

                        

                        .imageB {
                            
                            padding-bottom: 10px;
                            margin-left:20px;
                            display:inline-block;
                        }

                        .section {
                            padding-top: 25px;
                        }

                        .auctionLogo {
                            display: flex;
                            justify-content: center;
                            padding-top: 20px;
                        }

                        .footer {
                            padding-top: 10px;
                            color:black;
                        }

                        .Fname {
                            display: flex;
                        }

                        .span {
                            margin-right: 8px;
                        }

                        .fontfame {
                            font-family: 'Inter', sans-serif !important;
                            font-style: normal;
                            font-weight: 500;
                            font-size:16px;
                        }
                            .fonttext {
                            font-family: 'Inter', sans-serif !important;
                            font-style: normal;
                            font-weight: 500;
                            font-size:18px;
                        }
                            .fontbutton{
                                font-family: 'Inter', sans-serif !important;
                            font-style: normal;
                            font-weight: 500;
                            font-size:14px;
                            }

                        .a3s {
                            direction: initial;
                            font: Inter, sans-serif !important;
                            overflow-x: auto;
                            overflow-y: hidden;
                            position: relative;
                        }
                            
                            .bid{
                                text-align:center;
                                font-family:Inter;
                                padding-left:6px;
                                margin-left:10px;
                                color:black;
                                font-size: 14px;
                            font-style: normal;
                            font-weight: 500;
                            color: #343434;
                            line-height: 15px;
                            } 
                            
                        </style>
                    </head>
                    <body>
                        <div class="container textName">
                            <div style="justify-content: center; padding-top: 20px;" vertical-align="middle" align="center">
                                <img src="*|LOGO_URL|*" alt="auction" style="width:100px; height:auto;object-fit:contain;"/>
                        </div>
                            
                        <div class="header section">
                            <div class="Fname">
                                <p class="span fontfame" style="color:black;">Dear </p>
                                <p style="padding-left:6px;color:black;" class="fontfame">*|FIRST_NAME|*</p>
                            <p>,</p>
                            </div>
                            
                            
                            <p style="padding-top:20px;color:black;" class="fontfame">Thank you for placing your bid. In case you want to increase your maximum bid, you can do so at the auction page. The highest bidder when the countdown timer ends, wins the auction.</p>
                            <div style="padding-top:20px; color:black;" class="fontfame"><span>*|EXTENSION_CONTENT|*</span>
                            </div>
                            <p style="padding-top:20px;color:black;" class="fontfame">Fingers crossed and best of luck.</p>

                        </div>
                            
                            
                        <div class="auction" style="flex-wrap:wrap">
                            
                                <div class="imageA">
                                    <a href="*|AUCTION_URL|*">  <img src="*|AUCTION_IMAGE|*" width="200" style="max-height:200px;object-fit:contain;" alt="image"/></a>
                                </div>
                            
                            
                                    <div class="imageB">
                                        <div>
                                                <span class="auction_title fontfame">
                                                    <p class="fonttext" style=" font-family: 'Inter', sans-serif;color:black;word-break:break-all;">*|AUCTION_TITLE|*</p>
                                                </span>
                                                <p class="dates">
                                                    <span>Auction ends: *|AUCTION_DATE|*</span>
                                                </p>
                                        </div>
                                        <div style="display:inline-grid;margin-top:55px;">
                                        <a href="*|AUCTION_URL|*" style="text-decoration:none;"><span style="background-color: #282828; color: #fff; padding-top:16px;padding-bottom:16px; padding-left:31px; padding-right:31px; text-decoration: none; border-radius: 6px; margin-bottom:10px;margin-top:10px;" class="fontbutton">View Auction </span> </a>
                                        </div>
                                    </div>
                        </div>
                            
                            
                            
                            
                            
                        <div class="lot" style="flex-wrap:wrap">
                                    <div class="imageA">
                                        <a href="*|LOT_REDIRECTION_URL|*"><img src="*|LOT_IMAGE|*" width="200" style="max-height:200px;object-fit:contain;" alt="lot-Image"/></a>
                                    
                                    </div>
                                    <div class="imageB">
                                        <div style="height:100%;">
                                            <span class="auction_title fontfame">
                                                <p class="span fonttext" style="color:black;word-break:break-all;">*|LOT_NUMBER|*. *|LOT_TITLE|*</p>
                                            </span>
                                            
                                            <div style="display:flex; justify-content:space-between; align:center; padding-top:8px;color:black;">
                                            <p class="amount" style="font-family:Inter;color:black;">Bid Amount: </p>
                                            <p class="bid">*|BID_AMOUNT|*	</p>
                                </div>
                                
                                        </div>    
                                        
                                    </div>
                            
                                    
                        
                        </div>
                            
                            
                            
                            <p class="header footer fontfame" style="padding-top:20px;">For any questions, please contact *|SELLER_EMAIL|*</p>
                        <p class="header footer fontfame">All our best, <br> </p>
                            <p class="fontfame" style="color:black;">*|SELLER_NAME|*</p>
                            <p class="author_title" style="padding-top:10px;">Powered by Indy.auction</p>
                        </div>
                    </body>
                    </html>`

        const outBidHtml = `<!DOCTYPE html>
                            <html lang="en">
                            <head>
                                <meta charset="UTF-8">
                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                <link rel="preconnect" href="https://fonts.googleapis.com">
                                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
                                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
                                <title>Auction Bid Confirmation</title>
                                <style>
                                    @import url(https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap);
                                body {
                                    font-family: Inter, sans-serif;
                                    line-height: 1.6;
                                    background-color: #E6E6E6;
                                }

                                .container {
                                    max-width: 600px;
                                    margin: 0 auto;
                                    padding: 20px 40px 20px 40px;
                                    background-color: #FFFFFF;
                                    border-radius: 10px;
                                    margin-top: 36px;
                                }

                                .button {
                                    display: inline-block;
                                    width: 130px;
                                    height: 46px;
                                    padding: 10px 20px;
                                    text-decoration: none;
                                    background-color: #282828;
                                    color: white;
                                    border: none;
                                    border-radius: 6px;
                                    margin-top: 10px;
                                }

                                .text {
                                    font-size: 14px;
                                    line-height: 16px;
                                    text-align: center;
                                }

                                .header {
                                    font-style: normal;
                                    font-weight: 500;
                                    font-size: 16px;
                                    line-height: 19px;
                                    color:black;
                                }

                                .dates {
                                    font-size: 14px;
                                    font-style: normal;
                                    font-weight: 500;
                                    color: #A1A1A9;
                                    line-height: 15px;
                                    padding-top:8px;
                                }

                                .amount {
                                    font-size: 14px;
                                    font-style: normal;
                                    font-weight: 500;
                                    color: #343434;
                                    line-height: 15px;
                                }

                                .auction_title {
                                    font-size: 18px;
                                    font-weight: 500;
                                    line-height: 22px;
                                    color: #343434;
                                }

                                .author_title {
                                    /* left: calc(50% - 220px/2);
                                    position: absolute; */
                                    margin-top: 28px;
                                    color: #A1A1A9;
                                    font-size: 12px;
                                    line-height: 14px;
                                    text-align: center;
                                }

                                .testName {
                                    position: absolute;
                                    width: 554px;
                                    height: 200px;
                                    left: calc(50% - 554px/2);
                                    top: 152px;
                                    color: #343434;
                                }

                                .auction {
                                    display: flex;
                                    justify-content: space-between;
                                    align-items: center;
                                    border: 1px solid #E4E4E7;
                                    border-radius: 8px;
                                    padding-top:10px;
                                    padding-right:20px; 
                                    padding-bottom:10px;
                                    padding-left:20px;
                                    margin-top:20px;
                                
                                
                                }

                                .lot {
                                    display: flex;
                                    justify-content: space-between;
                                    align-items: center;
                                    border: 1px solid #E4E4E7;
                                    border-radius: 8px;
                                    padding: 10px 20px 10px 20px;
                                    margin-top: 12px;
                                    
                                }
                                    
                                    @media only screen and (max-width:748px){
                                    
                                            .lot {
                                            display: block;
                                            justify-content: space-between;
                                            align-items: center;
                                            border: 1px solid #E4E4E7;
                                            border-radius: 8px;
                                            padding: 10px 20px 10px 20px;
                                            margin-top: 12px;
                                                
                                        }
                                        
                                        .auction {
                                                display: block;
                                                justify-content: space-between;
                                                align-items: center;
                                                border: 1px solid #E4E4E7;
                                                border-radius: 8px;
                                                padding: 10px 20px 10px 20px;
                                                margin-top: 22px;
                                            }
                                        
                                        .fonttext {
                                                font-family: Inter, sans-serif !important;
                                                font-style: normal;
                                                font-weight: 500;
                                                font-size:14px;
                                                color:black;
                                            
                                                    }      
                                        .imageB {
                                    
                                                padding-bottom: 10px;
                                                margin-left:0px !important;
                                                display:inline-block;
                                            
                                                        margin-top: 12px;
                                            margin-bottom:10px;
                                                            
                                                }
                                        .auction {
                                                display: block;
                                                justify-content: space-between;
                                                align-items: center;
                                                border: 1px solid #E4E4E7;
                                                border-radius: 8px;
                                                padding: 10px 20px 10px 20px;
                                                margin-top: 22px;
                                        }
                                        
                                        
                                        .header {
                                    font-style: normal;
                                    font-weight: 500;
                                    font-size: 12px;
                                    line-height: 19px;
                                    color:black;
                                }

                                .dates {
                                    font-size: 10px !important;
                                    font-style: normal;
                                    font-weight: 500;
                                    color: #A1A1A9;
                                    line-height: 15px;
                                    padding-top:8px;
                                }

                                .amount {
                                    font-size: 12px !important;
                                    font-style: normal;
                                    font-weight: 500;
                                    color: #343434;
                                    line-height: 15px;
                                }

                                .auction_title {
                                    font-size: 14px !important;
                                    font-weight: 500;
                                    line-height: 22px;
                                    color: #343434;
                                }
                                        
                                
                                    
                                
                                }
                                    
                                    p{
                                    margin:0px !important;
                                }
                                span{
                                    margin:0px !important;
                                }
                                

                                

                                .imageB {
                                    
                                    padding-bottom: 10px;
                                    margin-left:20px;
                                    display:inline-block;
                                }

                                .section {
                                    padding-top: 25px;
                                }

                                .auctionLogo {
                                    display: flex;
                                    justify-content: center;
                                    padding-top: 20px;
                                }

                                .footer {
                                    padding-top: 10px;
                                    color:black;
                                }

                                .Fname {
                                    display: flex;
                                }

                                .span {
                                    margin-right: 8px;
                                }

                                .fontfame {
                                    font-family: 'Inter', sans-serif !important;
                                    font-style: normal;
                                    font-weight: 500;
                                    font-size:16px;
                                }
                                    .fonttext {
                                    font-family: 'Inter', sans-serif !important;
                                    font-style: normal;
                                    font-weight: 500;
                                    font-size:18px;
                                }
                                    .fontbutton{
                                        font-family: 'Inter', sans-serif !important;
                                    font-style: normal;
                                    font-weight: 500;
                                    font-size:14px;
                                    }

                                .a3s {
                                    direction: initial;
                                    font: Inter, sans-serif !important;
                                    overflow-x: auto;
                                    overflow-y: hidden;
                                    position: relative;
                                }
                                    
                                    .bid{
                                        text-align:center;
                                        font-family:Inter;
                                        padding-left:6px;
                                        margin-left:10px;
                                        color:black;
                                        font-size: 14px;
                                    font-style: normal;
                                    font-weight: 500;
                                    color: #343434;
                                    line-height: 15px;
                                    } 
                                    
                                </style>

                            </head>
                            <body>
                                <div class="container textName">
                                    <div style="justify-content: center; padding-top: 20px;" vertical-align="middle" align="center">
                                        <img src="*|LOGO_URL|*" alt="auction" style="width:100px; height:auto;object-fit:contain;"/>
                                </div>
                                    
                                    
                                <div class="header section">
                                    <div class="Fname">
                                    <p class="fontfame">Dear </p>
                                        <p style="padding-left:6px;" class="fontfame">*|FIRST_NAME|*</p>
                                    <p>,</p>
                                    </div>
                                    <p style=" padding-top:20px;color:black;" class="fontfame">Someone has bid against you on your auction lot.</p>
                                    <p class="fontfame" style=" padding-top:20px;color:black;">To bid again, or set a new maximum bid, please click on the lot image below. The highest bidder when the countdown timer ends, wins the auction.</p>
                                    
                                    <div class="fontfame" style=" padding-top:20px;color:black;"> <span>*|EXTENSION_CONTENT|*</span>        </div>
                                    <p style="padding-top:20px;color:black;" class="fontfame">Fingers crossed and best of luck.</p>

                                </div>
                                    
                                    
                                    
                                    
                                    
                                    <div class="auction">
                                    
                                        <div class="imageA">
                                            <a href="*|AUCTION_URL|*">  <img src="*|AUCTION_IMAGE|*" width="200" style="max-height:200px;object-fit:contain;" alt="image"/></a>
                                        </div>
                                    
                                    
                                            <div class="imageB">
                                                <div>
                                                        <span class="auction_title fontfame">
                                                            <p class="fonttext" style=" font-family: 'Inter', sans-serif;color:black;word-break:break-all;">*|AUCTION_TITLE|*</p>
                                                        </span>
                                                    <p class="dates">
                                                            <span>Auction ends: *|AUCTION_DATE|*</span>
                                                        </p>
                                                </div>
                                                <div style="display:inline-grid; margin-top:55px;">
                                                    <a href="*|AUCTION_URL|*" style="text-decoration:none;" class="fontbutton">  <span style="background-color: #282828; color: #fff; padding-top:16px;padding-bottom:16px; padding-left:31px; padding-right:31px; text-decoration: none; border-radius: 6px; margin-bottom:10px;margin-top:10px;" class="buttonView">View Auction</span></a>
                                                </div>
                                                
                                            </div>
                                </div>
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    <div class="lot">
                                            <div class="imageA">
                                                <a href="*|LOT_REDIRECTION_URL|*"><img src="*|LOT_IMAGE|*" width="200" style="max-height:200px;object-fit:contain;" alt="lot-Image"/></a>
                                            
                                            </div>
                                    
                                            <div class="imageB">
                                                <div style="height:80%;">
                                                    <span class="auction_title fontfame">
                                                        <p class="span fonttext" style="color:black;word-break:break-all;">*|LOT_NUMBER|*. *|LOT_TITLE|*</p>
                                                    </span>
                                                    
                                                    <div style="display:flex; justify-content:space-between; align:center; padding-top:8px;color:black;">
                                                            <p class="amount" style="font-family:Inter;color:black;">Bid Amount: </p>
                                                            <p style="" class="bid">*|BID_AMOUNT|*</p>
                                                    </div>
                                        
                                                </div>    
                                                
                                            </div>
                                </div>
                                    
                                    
                                    
                                    
                                    <p class="header footer fontfame" style="padding-top:20px;">For any questions, please contact *|SELLER_EMAIL|*</p>
                                <p class="header footer fontfame">All our best, <br> </p>
                                    <p class="fontfame" style="color:black;">*|SELLER_NAME|*</p>
                                    
                                    
                                    <p class="author_title" style="font-family:Inter; padding-top:10px;">Powered by Indy.auction</p>
                                </div>
                            </body>
                            </html>`

        return {
            registrationSuccess,
            otpHtml,
            congratulationsHtml,
            paymentRecieptHtml,
            winningBidHtml,
            outBidHtml,
        }
    } catch (e) {
        return e
    }
}
