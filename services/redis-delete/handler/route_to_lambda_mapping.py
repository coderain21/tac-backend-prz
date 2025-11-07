"""Complete route to Lambda function mapping for all 124 API endpoints"""

def get_route_to_lambda_mapping(stage):
    """Returns complete mapping of (service, route) to Lambda function name"""
    
    return {
        # Users Management (from users/serverless.yml)
        ('users-management', '/password-update/{email}'): f'users-management-{stage}-update_password',
        ('users-management', '/verify-captcha'): f'users-management-{stage}-verify-recaptha',
        ('users-management', '/otp-validation'): f'users-management-{stage}-otp-validation',
        ('users-management', '/forgot_password'): f'users-management-{stage}-send-reset-link',
        ('users-management', '/reset_password'): f'users-management-{stage}-update-new-password',
        ('users-management', '/auth/login'): f'users-management-{stage}-generate_token',
        ('users-management', '/request-otp'): f'users-management-{stage}-request-otp',
        ('users-management', '/{email}'): f'users-management-{stage}-view_profile',
        ('users-management', '/generate'): f'users-management-{stage}-generate_token',
        ('users-management', '/update-plan/{email}'): f'users-management-{stage}-update_plan',
        ('users-management', '/payment-intent'): f'users-management-{stage}-create_payment_intent',
        ('users-management', '/seller-sub-domain'): f'users-management-{stage}-seller_subdomain',
        ('users-management', '/stripe'): f'users-management-{stage}-stripe_connect',
        ('users-management', '/stripe_webhook_trigger'): f'users-management-{stage}-stripe_webhook',
        ('users-management', '/get-template/{template_name}'): f'users-management-{stage}-get_template',
        ('users-management', '/create-template'): f'users-management-{stage}-create_template',

        # Buyers (from buyers/serverless.yml)
        ('buyers', '/verify-captcha'): f'buyers-{stage}-verify-recaptha',
        ('buyers', '/otp-validation'): f'buyers-{stage}-otp-validation',
        ('buyers', '/update-password'): f'buyers-{stage}-update_password',
        ('buyers', '/forgot_password'): f'buyers-{stage}-send-reset-link',
        ('buyers', '/reset_password'): f'buyers-{stage}-update-new-password',
        ('buyers', '/profile'): f'buyers-{stage}-view_profile',
        ('buyers', '/view-lots'): f'buyers-{stage}-view_lots',
        ('buyers', '/lot-details'): f'buyers-{stage}-view_lot_details',
        ('buyers', '/auction-register'): f'buyers-{stage}-auction_register',
        ('buyers', '/view'): f'buyers-{stage}-view',
        ('buyers', '/paddle'): f'buyers-{stage}-paddle_number',
        ('buyers', '/search-lots'): f'buyers-{stage}-search_lots',
        ('buyers', '/approval'): f'buyers-{stage}-acceting_buyer',
        ('buyers', '/verify-card'): f'buyers-{stage}-credit_card',
        ('buyers', '/'): f'buyers-{stage}-view',
        ('buyers', '/add-address'): f'buyers-{stage}-add_address',
        ('buyers', '/links'): f'buyers-{stage}-get_links',
        ('buyers', '/buyer-logs'): f'buyers-{stage}-buyer_logs',
        ('buyers', '/policy/{auction_id}'): f'buyers-{stage}-auction_policy',

        # Subdomain
        ('subdomain', '/subdomain'): f'subdomain-{stage}-sub-domain',

        # Bids
        ('bids', '/update'): f'bids-{stage}-add-to-group',
        ('bids', '/'): f'bids-{stage}-view',
        ('bids', '/{id}'): f'bids-{stage}-view_bid',
        ('bids', '/admin/{id}'): f'bids-{stage}-admin_view',

        # Payments
        ('payments', '/stripe'): f'payments-{stage}-create_intent',
        ('payments', '/payments_webhook'): f'payments-{stage}-stripe_webhook',

        # PayPal
        ('paypal', '/paypal-order'): f'paypal-{stage}-create-order',
        ('paypal', '/capture-order'): f'paypal-{stage}-paypal-capture-order',
        ('paypal', '/paypal-connect'): f'paypal-{stage}-connect',
        ('paypal', '/paypal-connect-webhook'): f'paypal-{stage}-connect_webhook',
        ('paypal', '/paypal-disconnect'): f'paypal-{stage}-disconnect',
        ('paypal', '/paypal-order-webhook'): f'paypal-{stage}-order_webhook',

        # Cart Management
        ('cart-management', '/cart'): f'cart-management-{stage}-view_cart',

        # Auctions (from auctions/serverless.yml)
        ('auctions', '/'): f'auctions-{stage}-create',  # POST method
        ('auctions', '/' + 'GET'): f'auctions-{stage}-list_auction',  # GET method
        ('auctions', '/lots'): f'auctions-{stage}-create_lots',  # POST method
        ('auctions', '/lots' + 'GET'): f'auctions-{stage}-list_lots',  # GET method
        ('auctions', '/admin/lots'): f'auctions-{stage}-admin_list_lots',
        ('auctions', '/view'): f'auctions-{stage}-view',
        ('auctions', '/{auction_id}'): f'auctions-{stage}-unpublish_auction',  # PATCH method
        ('auctions', '/{auction_id}' + 'DELETE'): f'auctions-{stage}-delete_auction',  # DELETE method
        ('auctions', '/update/{auction_id}'): f'auctions-{stage}-update_auction',
        ('auctions', '/clone'): f'auctions-{stage}-clone_auction',
        ('auctions', '/import'): f'auctions-{stage}-import_lots',
        ('auctions', '/reorder-lots'): f'auctions-{stage}-reorder_lot',
        ('auctions', '/deactivate'): f'auctions-{stage}-deactivate',
        ('auctions', '/leaderboard/{auction_id}'): f'auctions-{stage}-leaderboard',
        ('auctions', '/image'): f'auctions-{stage}-delete_image',
        ('auctions', '/process-cart'): f'auctions-{stage}-process-cart',
        ('auctions', '/save-to-cache'): f'auctions-{stage}-save-to-cache',
        ('auctions', '/batchLotsPublish'): f'auctions-{stage}-batchLotsPublish',
        ('auctions', '/batchLotsUpdate'): f'auctions-{stage}-batchLotsUpdate',

        # Address Management
        ('address-management', '/address'): f'address-management-{stage}-add_shipping_address',  # POST method
        ('address-management', '/address' + 'GET'): f'address-management-{stage}-view_address',  # GET method
        ('address-management', '/address' + 'PATCH'): f'address-management-{stage}-update_address',  # PATCH method

        # Buyer Wishlist
        ('buyer-wishlist', '/'): f'buyer-wishlist-{stage}-create',
        ('buyer-wishlist', '/remove'): f'buyer-wishlist-{stage}-remove_wishlist',
        ('buyer-wishlist', '/wishlist'): f'buyer-wishlist-{stage}-wishlist-listing',

        # Admin Buyer Bid History
        ('admin-buyer-bid-history', '/admin/{buyer_id}'): f'admin-buyer-bid-history-{stage}-update_buyer',
        ('admin-buyer-bid-history', '/admin/buyer/{email_address}'): f'admin-buyer-bid-history-{stage}-get_buyer',
        ('admin-buyer-bid-history', '/list/{seller_email}/{auction_id}'): f'admin-buyer-bid-history-{stage}-list_bids',
        ('admin-buyer-bid-history', '/bids'): f'admin-buyer-bid-history-{stage}-view_bids',
        ('admin-buyer-bid-history', '/delete-buyer'): f'admin-buyer-bid-history-{stage}-delete_buyer',

        # Seller Bidder Management
        ('seller-bidder-management', '/'): f'seller-bidder-management-{stage}-view_bidders',
        ('seller-bidder-management', '/seller-orders'): f'seller-bidder-management-{stage}-seller_orders',

        # Lot Bid History
        ('lot-bid-history', '/{lot_id}'): f'lot-bid-history-{stage}-view-lot-bids',
        ('lot-bid-history', '/buyer/{lot_id}'): f'lot-bid-history-{stage}-buyer-bids',
        ('lot-bid-history', '/auction/{auction_id}'): f'lot-bid-history-{stage}-auction-bids',
        ('lot-bid-history', '/seller/bids'): f'lot-bid-history-{stage}-seller-bids',

        # Orders
        ('orders', '/'): f'orders-{stage}-view_orders',
        ('orders', '/details'): f'orders-{stage}-order_details',
        ('orders', '/update'): f'orders-{stage}-update_order',
        ('orders', '/sales'): f'orders-{stage}-sales',
        ('orders', '/seller'): f'orders-{stage}-seller_list_orders',

        # Site Banner
        ('site-banner', '/'): f'site-banner-{stage}-manage_banner',  # POST method
        ('site-banner', '/' + 'GET'): f'site-banner-{stage}-get_banner',  # GET method
        ('site-banner', '/{audience}'): f'site-banner-{stage}-audience_banner',
        ('site-banner', '/delete/{notification_id}'): f'site-banner-{stage}-delete_banner',

        # Admin Management
        ('admin-management', '/auctions'): f'admin-management-{stage}-view_auctions',
        ('admin-management', '/buyers'): f'admin-management-{stage}-view_buyers',
        ('admin-management', '/buyer-details'): f'admin-management-{stage}-buyer_details',
        ('admin-management', '/buyer-auctions'): f'admin-management-{stage}-buyer_auctions',
        ('admin-management', '/{id}'): f'admin-management-{stage}-view_item',
        ('admin-management', '/clone-auction'): f'admin-management-{stage}-clone_auction',
        ('admin-management', '/order-details'): f'admin-management-{stage}-order_details',
        ('admin-management', '/auction-purchases'): f'admin-management-{stage}-auction_purchases',
        ('admin-management', '/auction-details'): f'admin-management-{stage}-auction_details',
        ('admin-management', '/accountings'): f'admin-management-{stage}-accountings',
        ('admin-management', '/view-seller'): f'admin-management-{stage}-view_seller',
        ('admin-management', '/update-seller-status'): f'admin-management-{stage}-update_seller_status',
        ('admin-management', '/unpublish-auction'): f'admin-management-{stage}-unpublish_auction',
        ('admin-management', '/admin_bdd-update/{auction_id}'): f'admin-management-{stage}-admin_bdd_update',
        ('admin-management', '/publish-auction/{auction_id}'): f'admin-management-{stage}-publish_auction',
        ('admin-management', '/admin-subdomain'): f'admin-management-{stage}-admin_subdomain',
        ('admin-management', '/edit-auction/{auction_id}'): f'admin-management-{stage}-edit_auction',
        ('admin-management', '/update-lot'): f'admin-management-{stage}-update_lot',
        ('admin-management', '/all-sellers'): f'admin-management-{stage}-all_sellers',
        ('admin-management', '/admin-update-password'): f'admin-management-{stage}-admin_update_password',
        ('admin-management', '/enable-disable-seller'): f'admin-management-{stage}-enable_disable_seller',
        ('admin-management', '/update-seller-settings'): f'admin-management-{stage}-update_seller_settings',

        # Newsletter
        ('newsletter', '/'): f'newsletter-{stage}-update',

        # QuickSight Dashboards
        ('quicksight-dashboards', '/'): f'quicksight-dashboards-{stage}-main_dashboard',
        ('quicksight-dashboards', '/auction-view'): f'quicksight-dashboards-{stage}-auction_view',
        ('quicksight-dashboards', '/admin-view'): f'quicksight-dashboards-{stage}-admin_view',
        ('quicksight-dashboards', '/admin-auction-view'): f'quicksight-dashboards-{stage}-admin_auction_view',

        # Order Management
        ('order-management', '/orders'): f'order-management-{stage}-view_orders'
    }

def get_lambda_function_by_route(service, resource, method=None, stage='dev'):
    """Get Lambda function name for a specific route"""
    mapping = get_route_to_lambda_mapping(stage)
    
    # Try with method suffix first (for routes with multiple methods)
    if method:
        key_with_method = (service, resource + method)
        if key_with_method in mapping:
            return mapping[key_with_method]
    
    # Try without method
    key = (service, resource)
    return mapping.get(key, None)