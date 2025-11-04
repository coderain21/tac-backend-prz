"""
API Mapping Validation and Fixes for CloudWatch Alarm Handler

Based on serverless.yml analysis, here are the CORRECT Lambda function mappings:

ISSUES FOUND:
1. /v1/auctions -> Should map to auctions-{stage}-view (NOT payments-{stage}-create_intent)
2. Many Lambda function names in mappings don't match actual serverless.yml function names
3. Inconsistent naming patterns between mapping and actual functions

CORRECT MAPPINGS (based on serverless.yml files):

AUCTIONS SERVICE:
- create -> auctions-{stage}-create (✓ CORRECT)
- view -> auctions-{stage}-view (✓ CORRECT) 
- list_auction -> auctions-{stage}-list_auction (WRONG: mapped as 'view')
- create_lots -> auctions-{stage}-create_lots (✓ CORRECT)
- update_auction -> auctions-{stage}-update_auction (✓ CORRECT)
- unpublish_auction -> auctions-{stage}-unpublish_auction (✓ CORRECT)
- delete_lot -> auctions-{stage}-delete_lot (✓ CORRECT)
- update_lot -> auctions-{stage}-update_lot (✓ CORRECT)
- import_lots -> auctions-{stage}-import_lots (✓ CORRECT)
- clone_auction -> auctions-{stage}-clone_auction (✓ CORRECT)
- save-to-cache -> auctions-{stage}-save-to-cache (✓ CORRECT)
- process-cart -> auctions-{stage}-process-cart (✓ CORRECT)

PAYMENTS SERVICE:
- create_intent -> payments-{stage}-create_intent (✓ CORRECT)
- stripe_payments_webhook -> payments-{stage}-stripe_payments_webhook (MISSING)

BUYERS SERVICE:
- view -> buyers-{stage}-view (✓ CORRECT)
- verify-recaptha -> buyers-{stage}-verify-recaptha (✓ CORRECT)
- otp-validation -> buyers-{stage}-otp-validation (✓ CORRECT)
- view_lots -> buyers-{stage}-view_lots (✓ CORRECT)
- search_lots -> buyers-{stage}-search_lots (✓ CORRECT)
- view_lot_details -> buyers-{stage}-view_lot_details (✓ CORRECT)
- credit_card -> buyers-{stage}-credit_card (✓ CORRECT)
- acceting_buyer -> buyers-{stage}-acceting_buyer (✓ CORRECT)
- update_password -> buyers-{stage}-update_password (✓ CORRECT)
- auction_register -> buyers-{stage}-auction_register (✓ CORRECT)
- view_profile -> buyers-{stage}-view_profile (✓ CORRECT)
- paddle_number -> buyers-{stage}-paddle_number (✓ CORRECT)
- send-reset-link -> buyers-{stage}-send-reset-link (✓ CORRECT)
- update-new-password -> buyers-{stage}-update-new-password (✓ CORRECT)

KEY FIXES NEEDED:
1. /v1/auctions should map to auctions-{stage}-view (for listing auctions)
2. Add missing API endpoint mappings
3. Fix inconsistent function names in get_log_group_link function
4. Ensure all pattern matching covers actual API endpoints

CRITICAL FIX:
The main issue is that /v1/auctions is being mapped to payments Lambda instead of auctions Lambda.
This happens because the generic "Payments API" fallback is being used instead of specific endpoint matching.
"""

# Corrected mappings that should be applied:
CORRECT_API_MAPPINGS = {
    # Specific API endpoints (HIGHEST PRIORITY)
    'API: /v1/auctions': '/aws/lambda/auctions-{stage}-view',
    'API: /auctions': '/aws/lambda/auctions-{stage}-view',
    'API: /subdomain': '/aws/lambda/subdomain-{stage}-subdomain',
    'API: /lot-details': '/aws/lambda/buyers-{stage}-view_lot_details',
    'API: /forgot_password': '/aws/lambda/buyers-{stage}-send-reset-link',
    'API: /reset_password': '/aws/lambda/buyers-{stage}-update-new-password',
    
    # Authentication & Registration APIs
    'Subdomain API': '/aws/lambda/subdomain-{stage}-subdomain',
    'Buyer Verify Captcha API': '/aws/lambda/buyers-{stage}-verify-recaptha',
    'Buyer OTP Validation API': '/aws/lambda/buyers-{stage}-otp-validation',
    'Buyer Auth Login API': '/aws/lambda/users-management-{stage}-generate_token',
    'Seller Verify Captcha API': '/aws/lambda/users-management-{stage}-verify-recaptha',
    'Seller OTP Validation API': '/aws/lambda/users-management-{stage}-otp-validation',
    'Seller Request OTP API': '/aws/lambda/users-management-{stage}-request-otp',
    'Buyer Auction Register API': '/aws/lambda/buyers-{stage}-auction_register',
    'Buyer Verify Card API': '/aws/lambda/buyers-{stage}-credit_card',
    
    # Payments & Bidding APIs
    'Update Bid API': '/aws/lambda/bids-{stage}-update',
    'Stripe Checkout API': '/aws/lambda/payments-{stage}-create_intent',
    'PayPal Order API': '/aws/lambda/paypal-{stage}-create-order',
    'PayPal Capture API': '/aws/lambda/paypal-{stage}-paypal-capture-order',
    'Cart Management API': '/aws/lambda/cart-management-{stage}-view_cart',
    'Create Auction API': '/aws/lambda/auctions-{stage}-create',
    'Create Lot API': '/aws/lambda/auctions-{stage}-create_lots',
    'Publish Auction API': '/aws/lambda/auctions-{stage}-update_auction',
    
    # Viewing & Management APIs
    'Buyers View API': '/aws/lambda/buyers-{stage}-view',
    'Buyer View Lots API': '/aws/lambda/buyers-{stage}-view_lots',
    'Buyer Lot Details API': '/aws/lambda/buyers-{stage}-view_lot_details',
    'Buyer Paddle API': '/aws/lambda/buyers-{stage}-paddle_number',
    'Seller Auctions View API': '/aws/lambda/auctions-{stage}-view',
    'Seller Unpublish Auction API': '/aws/lambda/auctions-{stage}-unpublish_auction',
    
    # Profile Management APIs
    'Buyer Update Password API': '/aws/lambda/buyers-{stage}-update_password',
    'Buyer Forgot Password API': '/aws/lambda/buyers-{stage}-send-reset-link',
    'Buyer Reset Password API': '/aws/lambda/buyers-{stage}-update-new-password',
    'Seller Forgot Password API': '/aws/lambda/users-management-{stage}-send-reset-link',
    'Seller Reset Password API': '/aws/lambda/users-management-{stage}-update-new-password',
    'Buyer Profile API': '/aws/lambda/buyers-{stage}-view_profile',
    'Buyer Address Post API': '/aws/lambda/address-management-{stage}-add_shipping_address',
    'Buyer Address Get API': '/aws/lambda/address-management-{stage}-view_address',
    
    # Auction Management APIs
    'Seller Clone Auction API': '/aws/lambda/auctions-{stage}-clone_auction',
    'Seller View Bidders API': '/aws/lambda/bids-{stage}-view',
    'Seller Buyer Approval API': '/aws/lambda/buyers-{stage}-acceting_buyer',
    'Seller Update Lot API': '/aws/lambda/auctions-{stage}-update_lot',
    'Seller Delete Lot API': '/aws/lambda/auctions-{stage}-delete_lot',
    'Seller Import Lots API': '/aws/lambda/auctions-{stage}-import_lots',
    
    # Search & Wishlist APIs
    'Buyer Search Lots API': '/aws/lambda/buyers-{stage}-search_lots',
    'Buyer Add Wishlist API': '/aws/lambda/buyer-wishlist-{stage}-create',
    'Buyer Remove Wishlist API': '/aws/lambda/buyer-wishlist-{stage}-remove_wishlist',
    'Buyer View Wishlist API': '/aws/lambda/buyer-wishlist-{stage}-wishlist-listing',
    'Seller Export Data API': '/aws/lambda/orders-{stage}-seller_list_orders',
    'Seller Newsletter Get API': '/aws/lambda/newsletter-{stage}-update',
    
    # Lambda Functions
    'Process Cart Lambda': '/aws/lambda/auctions-{stage}-process-cart',
    'Save to Cache Lambda': '/aws/lambda/auctions-{stage}-save-to-cache',
    
    # Generic API categories - use most common API for each
    'Payments API': '/aws/lambda/payments-{stage}-create_intent',
    'Authentication API': '/aws/lambda/subdomain-{stage}-subdomain',
    'Viewing API': '/aws/lambda/buyers-{stage}-view_lot_details',
    'Profile API': '/aws/lambda/buyers-{stage}-send-reset-link'
}