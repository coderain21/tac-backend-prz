"""CloudWatch alarm handler for enhanced email notifications with log streams."""
import json
import re
from datetime import datetime, timedelta
import boto3
import os

def lambda_handler(event, context):
    """Enhanced CloudWatch alert handler for all alarm types"""
    print(f"DEBUG: Raw event received: {json.dumps(event, indent=2, default=str)}")
    sns = boto3.client('sns')

    # Handle different event formats
    if 'Records' in event:
        # SNS trigger
        for record in event['Records']:
            if 'Sns' in record:
                message = json.loads(record['Sns']['Message'])
                process_alarm(message, sns)
            else:
                # Direct record
                process_alarm(record, sns)
    elif 'source' in event and event['source'] == 'aws.cloudwatch':
        # CloudWatch Events trigger
        process_cloudwatch_event(event, sns)
    else:
        # Direct CloudWatch alarm invocation or unknown format
        process_alarm(event, sns)

    return {'statusCode': 200}
def process_cloudwatch_event(event, sns):
    """Process CloudWatch Events alarm state change"""

    print(f"DEBUG: Processing CloudWatch event: {json.dumps(event, indent=2, default=str)}")
    # Extract alarm data from the CloudWatch event
    alarm_data = event.get('alarmData', {})
    alarm_name = alarm_data.get('alarmName', 'Unknown Alarm')
    # Extract state information
    state = alarm_data.get('state', {})
    reason = state.get('reason', 'No reason provided')
    # Extract configuration
    configuration = alarm_data.get('configuration', {})
    alarm_description = configuration.get('description', 'No description available')
    metrics = configuration.get('metrics', [])
    # Extract failed API from metrics configuration
    failed_api = extract_failed_api_from_metrics(metrics, alarm_name, reason)

    # If we couldn't determine the specific API, try to query CloudWatch for recent errors
    if not failed_api or 'APIs' in failed_api:
        failed_api = query_recent_api_errors(metrics, alarm_name, reason)
    print(f"DEBUG: Extracted from CloudWatch - Name: {alarm_name}, Reason: {reason}, Failed API: {failed_api}")
    # Process the alarm
    alert_type, service_name, log_link = parse_alarm_details(alarm_name, reason, failed_api)
    alert_details = {
        'alert_type': alert_type,
        'service_name': service_name,
        'alarm_name': alarm_name,
        'reason': reason,
        'description': alarm_description,
        'failed_api': failed_api
    }
    enhanced_msg = create_alert_message(alert_details)

    # Send notification
    destination_topic = os.environ.get('SNS_TOPIC_ARN')
    if destination_topic:
        sns.publish(
            TopicArn=destination_topic,
            Message=enhanced_msg,
            Subject=f"{failed_api or service_name} - {alert_type} Alert"
        )
    else:
        print("ERROR: SNS_TOPIC_ARN not found in environment variables")

def process_alarm(message, sns):
    """Process alarm message and send notification"""

    # Debug: Log the entire message
    print(f"DEBUG: Processing alarm message: {json.dumps(message, indent=2, default=str)}")
    print(f"DEBUG: Message keys: {list(message.keys())}")
    print(f"DEBUG: Message type: {type(message)}")

    # Try multiple ways to extract alarm information
    alarm_name = (
        message.get('AlarmName') or
        message.get('alarm_name') or
        message.get('name') or
        message.get('detail', {}).get('alarmName') or
        'Unknown Alarm'
    )

    reason = (
        message.get('NewStateReason') or
        message.get('reason') or
        message.get('detail', {}).get('state', {}).get('reason') or
        'No reason provided'
    )

    alarm_description = (
        message.get('AlarmDescription') or
        message.get('description') or
        message.get('detail', {}).get('configuration', {}).get('description') or
        'No description available'
    )

    print(f"DEBUG: Extracted - Name: {alarm_name}, Reason: {reason}, Description: {alarm_description}")
    print(f"DEBUG: Alarm name analysis - Contains 'auth': {'auth' in alarm_name.lower()}, Contains 'viewing': {'viewing' in alarm_name.lower()}, Contains 'payments': {'payments' in alarm_name.lower()}")

    # Extract failed API from alarm name and reason
    print(f"DEBUG: About to extract failed API from alarm name: {alarm_name}")
    failed_api = extract_failed_api_from_alarm_name(alarm_name, reason)
    print(f"DEBUG: Extracted failed API: {failed_api}")

    # Determine alarm type and create appropriate message
    alert_type, service_name, log_link = parse_alarm_details(alarm_name, reason, failed_api)

    # Create enhanced message based on alarm type
    alert_details = {
        'alert_type': alert_type,
        'service_name': service_name,
        'alarm_name': alarm_name,
        'reason': reason,
        'description': alarm_description,
        'failed_api': failed_api
    }
    enhanced_msg = create_alert_message(alert_details)

    # Send enhanced notification to destination topic
    destination_topic = os.environ.get('SNS_TOPIC_ARN')
    if destination_topic:
        sns.publish(
            TopicArn=destination_topic,
            Message=enhanced_msg,
            Subject=f"{failed_api or service_name} - {alert_type} Alert"
        )
    else:
        print("ERROR: SNS_TOPIC_ARN not found in environment variables")

def extract_failed_api_from_metrics(metrics, alarm_name, reason):
    """Extract the specific failed API from CloudWatch metrics configuration"""

    print(f"DEBUG: Extracting API from metrics and reason: {reason}")

    # Parse timestamp from reason to query specific metrics
    timestamp_match = re.search(r'\((\d{2}/\d{2}/\d{2} \d{2}:\d{2}:\d{2})\)', reason)
    if timestamp_match:
        # Query CloudWatch to find which specific metric had errors
        specific_api = query_recent_api_errors(metrics, alarm_name, reason)
        if specific_api and 'Unknown' not in specific_api:
            return specific_api

    # Enhanced pattern matching for specific APIs with service context
    api_patterns = {
        # Authentication patterns - check most specific first with service context
        'buyer_otp_validation': 'API: /otp-validation (Buyers)',
        'seller_otp_validation': 'API: /otp-validation (Users)',
        'otp-validation': 'API: /otp-validation',
        'buyer_verify_captcha': 'API: /verify-captcha (Buyers)',
        'seller_verify_captcha': 'API: /verify-captcha (Users)',
        'verify-captcha': 'API: /verify-captcha', 
        'verify-recaptha': 'API: /verify-captcha',
        'subdomain_api': 'API: /subdomain',
        'subdomain': 'API: /subdomain',
        'auth/login': 'API: /auth/login',
        'generate_token': 'API: /auth/login',
        'request-otp': 'API: /request-otp',
        'auction-register': 'API: /auction-register',
        'verify-card': 'API: /verify-card',
        'credit_card': 'API: /verify-card',
        
        # Payment patterns
        'stripe_checkout': 'API: /stripe',
        'stripe': 'API: /stripe',
        'create_intent': 'API: /stripe',
        'paypal_order': 'API: /paypal-order',
        'paypal-order': 'API: /paypal-order',
        'paypal_capture': 'API: /capture-order',
        'capture-order': 'API: /capture-order',
        'cart_management': 'API: /cart',
        'view_cart': 'API: /cart',
        'buyer_bids_update': 'API: /update',
        'add-to-group': 'API: /update',
        
        # Auction patterns
        '/v1/auctions': 'API: /v1/auctions',
        '/auctions': 'API: /auctions',
        'seller_create_auction': 'API: /auctions (POST)',
        'create_lots': 'API: /lots (POST)',
        'seller_create_lot': 'API: /lots (POST)',
        'update_auction': 'API: /update-auction',
        'seller_publish_auction': 'API: /update-auction',
        
        # Viewing patterns
        'buyer_lot_details': 'API: /lot-details',
        'lot-details': 'API: /lot-details',
        'view_lot_details': 'API: /lot-details',
        'buyer_view_lots': 'API: /view-lots',
        'view-lots': 'API: /view-lots',
        'view_lots': 'API: /view-lots',
        'buyer_paddle': 'API: /paddle',
        'paddle_number': 'API: /paddle'
    }

    # Check reason text for specific API patterns
    reason_lower = reason.lower()
    for pattern, api_name in api_patterns.items():
        if pattern in reason_lower:
            print(f"DEBUG: Found API pattern '{pattern}' -> {api_name}")
            return api_name

    # Fallback to alarm category if no specific API found
    if 'auth' in alarm_name.lower():
        return 'Authentication API (check logs for specific endpoint)'
    elif 'payments' in alarm_name.lower():
        return 'Payments API (check logs for specific endpoint)'
    elif 'viewing' in alarm_name.lower():
        return 'Viewing API (check logs for specific endpoint)'
    elif 'profile' in alarm_name.lower():
        return 'Profile API (check logs for specific endpoint)'
    elif 'management' in alarm_name.lower():
        return 'Management API (check logs for specific endpoint)'
    elif 'search' in alarm_name.lower():
        return 'Search API (check logs for specific endpoint)'

    return None

def extract_failed_api_from_alarm_name(alarm_name, reason):
    """Extract the specific failed API from alarm name and reason"""

    print(f"DEBUG: Extracting API from alarm: {alarm_name}, reason: {reason}")

    # First check for specific API paths in the reason
    if '/v1/auctions' in reason or '/auctions' in reason:
        return 'API: /v1/auctions'
    elif '/forgot_password' in reason or 'forgot_password' in reason.lower():
        if 'buyer' in alarm_name.lower() or 'profile' in alarm_name.lower():
            return 'API: /forgot_password'
        else:
            return 'API: /forgot_password'
    elif '/reset_password' in reason or 'reset_password' in reason.lower():
        return 'API: /reset_password'
    elif '/lot-details' in reason or 'lot_details' in reason.lower():
        return 'API: /lot-details'
    elif '/subdomain' in reason or 'subdomain' in reason.lower():
        return 'API: /subdomain'

    # Parse from alarm name patterns
    if 'auth' in alarm_name.lower():
        return 'Authentication API'
    elif 'payments' in alarm_name.lower():
        # For payments alarms, try to detect if it's actually an auctions endpoint
        if 'auctions' in reason.lower() or '/v1/auctions' in reason.lower():
            return 'API: /v1/auctions'
        return 'Payments API'
    elif 'viewing' in alarm_name.lower():
        return 'Viewing API'
    elif 'profile' in alarm_name.lower():
        return 'Profile API'
    elif 'management' in alarm_name.lower():
        return 'Management API'
    elif 'search' in alarm_name.lower():
        return 'Search API'

    # Parse from reason text for specific APIs
    api_keywords = {
        'subdomain_api': 'Subdomain API',
        'buyer_verify_captcha': 'Buyer Verify Captcha API',
        'buyer_otp_validation': 'Buyer OTP Validation API',
        'buyer_auth_login': 'Buyer Auth Login API',
        'buyer_lot_details': 'Buyer Lot Details API',
        'buyer_view_lots': 'Buyer View Lots API',
        'buyer_view': 'Buyers View API',
        'stripe_checkout': 'Stripe Checkout API',
        'paypal_order': 'PayPal Order API'
    }

    for keyword, name in api_keywords.items():
        if keyword in reason.lower():
            return name

    return None

def query_recent_api_errors(metrics, alarm_name, reason=''):
    """Query CloudWatch to find which specific API had recent errors"""

    try:
        # Extract timestamp from reason if available

        # Parse timestamp from reason like "1.0 (31/10/25 08:45:00)"
        timestamp_match = re.search(r'\((\d{2}/\d{2}/\d{2} \d{2}:\d{2}:\d{2})\)', reason)

        if timestamp_match:
            # Parse the timestamp
            timestamp_str = timestamp_match.group(1)
            try:
                # Convert to datetime (assuming format DD/MM/YY HH:MM:SS)
                alarm_time = datetime.strptime(f"20{timestamp_str}", "%Y%m/%d/%y %H:%M:%S")
                start_time = alarm_time - timedelta(minutes=5)
                end_time = alarm_time + timedelta(minutes=5)
                print(f"DEBUG: Using alarm timestamp {alarm_time}, querying from {start_time} to {end_time}")
            except:
                # Fallback to recent time
                end_time = datetime.utcnow()
                start_time = end_time - timedelta(minutes=15)
                print(f"DEBUG: Could not parse timestamp, using recent time range")
        else:
            # Use recent time range
            end_time = datetime.utcnow()
            start_time = end_time - timedelta(minutes=15)
            print(f"DEBUG: No timestamp in reason, using recent time range")

        cloudwatch = boto3.client('cloudwatch', region_name='eu-west-2')

        # Check each individual metric for errors at the alarm time
        error_apis = []
        for metric in metrics:
            metric_id = metric.get('id', '')

            # Skip expression metrics
            if 'max5xx' in metric_id.lower() or 'expression' in metric:
                continue

            metric_stat = metric.get('metricStat', {})
            metric_info = metric_stat.get('metric', {})
            dimensions = metric_info.get('dimensions', {})

            if not dimensions:
                continue

            # Query this specific metric
            try:
                response = cloudwatch.get_metric_statistics(
                    Namespace='AWS/ApiGateway',
                    MetricName='5XXError',
                    Dimensions=[
                        {'Name': k, 'Value': v} for k, v in dimensions.items()
                    ],
                    StartTime=start_time,
                    EndTime=end_time,
                    Period=300,
                    Statistics=['Sum']
                )

                # Check if this metric has any errors
                datapoints = response.get('Datapoints', [])
                for datapoint in datapoints:
                    if datapoint.get('Sum', 0) > 0:
                        resource = dimensions.get('Resource', '')
                        api_gateway = dimensions.get('ApiName', '')
                        method = dimensions.get('Method', '')
                        error_count = datapoint.get('Sum', 0)
                        timestamp = datapoint.get('Timestamp', '')

                        # Create specific API name from resource, method, and service
                        if metric_id in ['buyer_otp_validation', 'seller_otp_validation']:
                            service_type = 'Buyers' if 'buyer' in metric_id else 'Users'
                            api_name = f"API: {resource} ({service_type})"
                        elif metric_id in ['buyer_verify_captcha', 'seller_verify_captcha']:
                            service_type = 'Buyers' if 'buyer' in metric_id else 'Users'
                            api_name = f"API: {resource} ({service_type})"
                        else:
                            api_name = f"API: {resource}"
                            if method:
                                api_name += f" ({method})"
                        
                        # Map common metric IDs to readable names
                        readable_name = get_api_name_from_query_id(metric_id) or api_name

                        print(f"DEBUG: Found {error_count} errors in {metric_id} at {timestamp} - {readable_name} ({resource} {method} on {api_gateway})")
                        error_apis.append({
                            'api_name': readable_name,
                            'resource': resource,
                            'method': method,
                            'error_count': error_count,
                            'timestamp': timestamp,
                            'metric_id': metric_id,
                            'api_gateway': api_gateway
                        })

            except Exception as e:
                print(f"DEBUG: Error querying metric {metric_id}: {str(e)}")
                continue

        # Return the API with the most recent or highest error count
        if error_apis:
            # Sort by timestamp (most recent first)
            error_apis.sort(key=lambda x: x['timestamp'], reverse=True)
            return error_apis[0]['api_name']

    except Exception as e:
        print(f"DEBUG: Error querying CloudWatch: {str(e)}")

    # Fallback to alarm name pattern
    if 'auth' in alarm_name.lower():
        return 'Authentication API (check CloudWatch for specific endpoint)'
    elif 'payments' in alarm_name.lower():
        return 'Payments API (check CloudWatch for specific endpoint)'
    elif 'viewing' in alarm_name.lower():
        return 'Viewing API (check CloudWatch for specific endpoint)'

    return 'Unknown API'

def query_specific_api_by_timestamp(alarm_name, reason):
    """Query CloudWatch to find which specific API failed at the exact timestamp"""
    
    try:
        # Extract timestamp from reason
        timestamp_match = re.search(r'\((\d{2}/\d{2}/\d{2} \d{2}:\d{2}:\d{2})\)', reason)
        if not timestamp_match:
            return None
            
        timestamp_str = timestamp_match.group(1)
        try:
            # Convert to datetime (format DD/MM/YY HH:MM:SS)
            alarm_time = datetime.strptime(f"20{timestamp_str}", "%Y%d/%m/%y %H:%M:%S")
        except:
            return None
            
        cloudwatch = boto3.client('cloudwatch', region_name='eu-west-2')
        stage = os.environ.get('STAGE', 'dev')
        
        # Define API endpoints to check based on alarm type
        api_checks = []
        if 'auth' in alarm_name.lower():
            api_checks = [
                (f'{stage}-buyers', '/otp-validation', 'POST', 'API: /otp-validation (Buyers)'),
                (f'{stage}-users-management', '/otp-validation', 'POST', 'API: /otp-validation (Users)'),
                (f'{stage}-buyers', '/verify-captcha', 'POST', 'API: /verify-captcha (Buyers)'),
                (f'{stage}-users-management', '/verify-captcha', 'POST', 'API: /verify-captcha (Users)'),
                (f'{stage}-subdomain', '/subdomain', 'PATCH', 'API: /subdomain'),
                (f'{stage}-users-management', '/auth/login', 'GET', 'API: /auth/login'),
                (f'{stage}-users-management', '/request-otp', 'POST', 'API: /request-otp'),
                (f'{stage}-buyers', '/auction-register', 'GET', 'API: /auction-register'),
                (f'{stage}-buyers', '/verify-card', 'POST', 'API: /verify-card')
            ]
        
        # Query each API for errors at the exact timestamp
        for api_name, resource, method, display_name in api_checks:
            try:
                response = cloudwatch.get_metric_statistics(
                    Namespace='AWS/ApiGateway',
                    MetricName='5XXError',
                    Dimensions=[
                        {'Name': 'ApiName', 'Value': api_name},
                        {'Name': 'Resource', 'Value': resource},
                        {'Name': 'Stage', 'Value': stage},
                        {'Name': 'Method', 'Value': method}
                    ],
                    StartTime=alarm_time - timedelta(minutes=1),
                    EndTime=alarm_time + timedelta(minutes=1),
                    Period=60,
                    Statistics=['Sum']
                )
                
                datapoints = response.get('Datapoints', [])
                for datapoint in datapoints:
                    if datapoint.get('Sum', 0) > 0:
                        dp_time = datapoint.get('Timestamp')
                        if abs((dp_time - alarm_time).total_seconds()) <= 60:  # Within 1 minute
                            print(f"DEBUG: Found exact match - {display_name} had {datapoint.get('Sum')} errors at {dp_time}")
                            return display_name
                            
            except Exception as e:
                print(f"DEBUG: Error checking {display_name}: {str(e)}")
                continue
                
    except Exception as e:
        print(f"DEBUG: Error in query_specific_api_by_timestamp: {str(e)}")
        
    return None

def query_specific_failing_api(alarm_name, reason):
    """Query CloudWatch to find the specific API that failed"""

    try:
        # Parse timestamp from reason

        # Extract timestamp from reason like "12.0 (31/10/25 09:35:00)"
        timestamp_match = re.search(r'\((\d{2}/\d{2}/\d{2} \d{2}:\d{2}:\d{2})\)', reason)

        if timestamp_match:
            timestamp_str = timestamp_match.group(1)
            try:
                # Convert to datetime (assuming format DD/MM/YY HH:MM:SS)
                alarm_time = datetime.strptime(f"20{timestamp_str}", "%Y%m/%d/%y %H:%M:%S")
                start_time = alarm_time - timedelta(minutes=5)
                end_time = alarm_time + timedelta(minutes=5)
            except:
                end_time = datetime.utcnow()
                start_time = end_time - timedelta(minutes=15)
        else:
            end_time = datetime.utcnow()
            start_time = end_time - timedelta(minutes=15)

        cloudwatch = boto3.client('cloudwatch', region_name='eu-west-2')

        # Define the API Gateway resources to check based on alarm type
        resources_to_check = []

        if 'profile' in alarm_name.lower():
            resources_to_check = [
                '/forgot_password',
                '/reset_password',
                '/update_password',
                '/profile',
                '/address'
            ]
        elif 'auth' in alarm_name.lower():
            resources_to_check = [
                '/subdomain',
                '/verify-captcha',
                '/otp-validation',
                '/auth/login',
                '/auction_register'
            ]
        elif 'viewing' in alarm_name.lower():
            resources_to_check = [
                '/lot-details',
                '/view-lots',
                '/view',
                '/paddle'
            ]
        elif 'payments' in alarm_name.lower():
            resources_to_check = [
                '/v1/auctions',
                '/stripe',
                '/paypal',
                '/cart',
                '/bids'
            ]

        print(f"DEBUG: Checking resources: {resources_to_check}")

        # Query each resource for 5XX errors
        for resource in resources_to_check:
            try:
                response = cloudwatch.get_metric_statistics(
                    Namespace='AWS/ApiGateway',
                    MetricName='5XXError',
                    Dimensions=[
                        {'Name': 'ApiName', 'Value': 'IndyAuction-dev-web'},
                        {'Name': 'Resource', 'Value': resource},
                        {'Name': 'Stage', 'Value': 'dev'}
                    ],
                    StartTime=start_time,
                    EndTime=end_time,
                    Period=300,
                    Statistics=['Sum']
                )

                datapoints = response.get('Datapoints', [])
                print(f"DEBUG: Checking {resource}: found {len(datapoints)} datapoints")
                for datapoint in datapoints:
                    error_count = datapoint.get('Sum', 0)
                    if error_count > 0:
                        print(f"DEBUG: Found {error_count} errors for {resource} at {datapoint.get('Timestamp')}")
                        return f"API: {resource}"
                    else:
                        print(f"DEBUG: No errors in datapoint for {resource}")

            except Exception as e:
                print(f"DEBUG: Error querying {resource}: {str(e)}")
                continue

    except Exception as e:
        print(f"DEBUG: Error in query_specific_failing_api: {str(e)}")

    return None

def extract_priority_from_alarm_name(alarm_name):
    """Extract priority level from alarm name"""

    alarm_lower = alarm_name.lower()

    if alarm_lower.startswith('p1-') or 'p1-' in alarm_lower:
        return 'P1 CRITICAL'
    elif alarm_lower.startswith('p2-') or 'p2-' in alarm_lower:
        return 'P2 MEDIUM'
    elif alarm_lower.startswith('p3-') or 'p3-' in alarm_lower:
        return 'P3 LOW'
    else:
        return 'PRIORITY UNKNOWN'

def get_api_name_from_query_id(query_id):
    """Convert CloudWatch metric query ID to readable API name"""

    api_map = {
        'subdomain_api': 'Subdomain API',
        'buyer_verify_captcha': 'Buyer Verify Captcha API',
        'buyer_otp_validation': 'Buyer OTP Validation API',
        'buyer_auth_login': 'Buyer Auth Login API',
        'seller_verify_captcha': 'Seller Verify Captcha API',
        'seller_otp_validation': 'Seller OTP Validation API',
        'seller_request_otp': 'Seller Request OTP API',
        'buyer_auction_register': 'Buyer Auction Register API',
        'buyer_verify_card': 'Buyer Verify Card API',
        'buyer_bids_update': 'Update Bid API',
        'stripe_checkout': 'Stripe Checkout API',
        'paypal_order': 'PayPal Order API',
        'paypal_capture': 'PayPal Capture API',
        'cart_management': 'Cart Management API',
        'seller_create_auction': 'Create Auction API',
        'seller_create_lot': 'Create Lot API',
        'seller_publish_auction': 'Publish Auction API',
        'buyer_view': 'Buyers View API',
        'buyer_view_lots': 'Buyer View Lots API',
        'buyer_lot_details': 'Buyer Lot Details API',
        'buyer_paddle': 'Buyer Paddle API',
        'seller_auctions_view': 'Seller Auctions View API',
        'seller_unpublish_auction': 'Seller Unpublish Auction API'
    }

    return api_map.get(query_id, None)

def parse_alarm_details(alarm_name, reason, failed_api):
    """Parse alarm details to determine type and service"""

    print(f"DEBUG: Parsing alarm - Name: {alarm_name}, Reason: {reason}, Failed API: {failed_api}")

    # Determine alarm type based on alarm name
    if '5xx' in alarm_name.lower():
        api_name = failed_api or "Unknown API"
        log_link = get_log_group_link_by_api_name(api_name)
        return "API 5XX Error", api_name, log_link
    elif 'lambda' in alarm_name.lower() and 'throttle' in alarm_name.lower():
        return "Lambda Throttling", "Lambda Functions", get_lambda_console_link()
    elif 'ecs' in alarm_name.lower():
        return "ECS Service Issue", "ECS Tasks", get_ecs_console_link()
    elif 'stepfunction' in alarm_name.lower():
        return "Step Function Failure", "Step Functions", get_stepfunction_console_link()
    elif 'documentdb' in alarm_name.lower():
        return "DocumentDB Alert", "DocumentDB Cluster", get_documentdb_console_link()
    elif 'redis' in alarm_name.lower():
        return "Redis Alert", "Redis Cluster", get_redis_console_link()
    elif 'process-cart' in alarm_name.lower() or 'process cart' in alarm_name.lower():
        return "Lambda Error", "Process Cart Lambda", get_lambda_logs_link('process-cart')
    elif 'save-to-cache' in alarm_name.lower() or 'save to cache' in alarm_name.lower():
        return "Lambda Error", "Save to Cache Lambda", get_lambda_logs_link('save-to-cache')
    elif 'throttlingexception' in alarm_name.lower():
        return "Lambda Throttling", "Unpublish Auction Lambda", get_lambda_logs_link('unpublish-auction')
    else:
        return "System Alert", f"Unknown Service (Alarm: {alarm_name})", ""

def create_alert_message(alert_details):
    """Create formatted alert message based on alarm type"""
    # Extract values from alert_details dict
    alert_type = alert_details['alert_type']
    service_name = alert_details['service_name']
    alarm_name = alert_details['alarm_name']
    reason = alert_details['reason']
    description = alert_details['description']
    failed_api = alert_details['failed_api']

    # Extract priority from alarm name
    priority = extract_priority_from_alarm_name(alarm_name)

    # For composite alarms, query CloudWatch to find the specific failing API
    if '5xx' in alarm_name.lower():
        print(f"DEBUG: Querying specific failing API for alarm: {alarm_name}")
        
        # Try to get the specific API from the timestamp in the reason
        specific_api = query_specific_api_by_timestamp(alarm_name, reason)
        if specific_api:
            print(f"DEBUG: Found specific API from timestamp query: {specific_api}")
            failed_api = specific_api
        else:
            print(f"DEBUG: No specific API found from timestamp, using fallback: {failed_api}")

    # If we still don't have a specific API, use a fallback based on alarm name
    if not failed_api or failed_api in ['Profile API', 'Authentication API', 'Viewing API', 'Payments API']:
        if 'profile' in alarm_name.lower():
            failed_api = 'API: /forgot_password'  # Most common profile API error
        elif 'auth' in alarm_name.lower():
            failed_api = 'API: /otp-validation (Users)'  # Changed from subdomain to OTP validation
        elif 'viewing' in alarm_name.lower():
            failed_api = 'API: /lot-details'  # Most common viewing API error
        elif 'payments' in alarm_name.lower():
            failed_api = 'API: /v1/auctions'  # Most common payments API error is actually auctions

    base_msg = f"""🚨 {alert_type.upper()} - {priority}

Failed API: {failed_api or service_name}
Alarm: {alarm_name}
Description: {description}

Reason: {reason}
"""

    # Always try to get the exact log stream
    print(f"DEBUG: Attempting to get log stream for API: '{failed_api or service_name}'")
    print(f"DEBUG: Alarm reason: '{reason}'")
    log_stream_link = get_recent_log_stream(failed_api or service_name, reason)
    if log_stream_link:
        print(f"DEBUG: Successfully got log stream link: {log_stream_link}")
        base_msg += f"\nExact Log Stream: {log_stream_link}"
    else:
        print(f"DEBUG: No log stream found, trying log group link")
        # Fallback to log group link
        log_group_link = get_log_group_link_by_api_name(failed_api or service_name)
        if log_group_link:
            print(f"DEBUG: Successfully got log group link: {log_group_link}")
            base_msg += f"\nLog Group: {log_group_link}"
        else:
            print(f"DEBUG: No log group link found either")

    return base_msg

def get_lambda_console_link():
    return "https://console.aws.amazon.com/lambda/home?region=eu-west-2#/functions"

def get_ecs_console_link():
    return "https://console.aws.amazon.com/ecs/home?region=eu-west-2#/clusters/websocket-cluster/services"

def get_stepfunction_console_link():
    return "https://console.aws.amazon.com/states/home?region=eu-west-2#/statemachines"

def get_documentdb_console_link():
    return "https://console.aws.amazon.com/docdb/home?region=eu-west-2#clusters"

def get_redis_console_link():
    return "https://console.aws.amazon.com/elasticache/home?region=eu-west-2#redis:"

def get_lambda_logs_link(function_type):
    """Get CloudWatch logs link for specific Lambda function types"""
    stage = os.environ.get('STAGE', 'prod')
    log_groups = {
        'process-cart': f'/aws/lambda/auctions-{stage}-process-cart',
        'save-to-cache': f'/aws/lambda/auctions-{stage}-save-to-cache',
        'unpublish-auction': f'/aws/lambda/auctions-{stage}-unpublish_auction'
    }

    log_group = log_groups.get(function_type, '')
    if log_group:
        return f"https://console.aws.amazon.com/cloudwatch/home?region=eu-west-2#logsV2:log-groups/log-group/{log_group.replace('/', '$252F')}"
    return ""

def get_recent_log_stream(api_name, reason):
    """Get the exact log stream containing errors at the alarm timestamp"""

    try:
        # Get the log group name for this API
        stage = os.environ.get('STAGE', 'dev')
        log_group_name = get_log_group_name_by_api(api_name, stage)

        if not log_group_name:
            print(f"DEBUG: No log group found for {api_name}")
            return None

        print(f"DEBUG: Found log group {log_group_name} for {api_name}")

        # Parse timestamp from alarm reason
        timestamp_match = re.search(r'\((\d{2}/\d{2}/\d{2} \d{2}:\d{2}:\d{2})\)', reason)

        if timestamp_match:
            timestamp_str = timestamp_match.group(1)
            try:
                # Convert to datetime (format DD/MM/YY HH:MM:SS)
                alarm_time = datetime.strptime(f"20{timestamp_str}", "%Y%d/%m/%y %H:%M:%S")
                # Convert to milliseconds since epoch for CloudWatch
                alarm_timestamp_ms = int(alarm_time.timestamp() * 1000)
                print(f"DEBUG: Parsed alarm timestamp: {alarm_time} ({alarm_timestamp_ms}ms)")
            except Exception as e:
                print(f"DEBUG: Could not parse timestamp {timestamp_str}: {e}")
                return None
        else:
            print(f"DEBUG: No timestamp found in reason: {reason}")
            return None

        # Query CloudWatch Logs to find log streams active at alarm time
        logs_client = boto3.client('logs', region_name='eu-west-2')

        # Get log streams that were active around the alarm time
        start_time = alarm_timestamp_ms - (5 * 60 * 1000)  # 5 minutes before
        end_time = alarm_timestamp_ms + (5 * 60 * 1000)    # 5 minutes after

        response = logs_client.describe_log_streams(
            logGroupName=log_group_name,
            orderBy='LastEventTime',
            descending=True,
            limit=10  # Check more streams to find the right one
        )

        log_streams = response.get('logStreams', [])
        print(f"DEBUG: Found {len(log_streams)} log streams")

        # Find the stream that contains events at the alarm time
        for stream in log_streams:
            stream_name = stream.get('logStreamName', '')
            first_event_time = stream.get('firstEventTime', 0)
            last_event_time = stream.get('lastEventTime', 0)

            print(f"DEBUG: Checking stream {stream_name}: {first_event_time} - {last_event_time}")

            # Check if this stream was active during the alarm time
            if first_event_time <= alarm_timestamp_ms <= last_event_time:
                print(f"DEBUG: Found matching stream: {stream_name}")

                # Verify this stream actually contains error logs
                try:
                    # Try multiple error patterns for different Lambda functions
                    error_patterns = ['ERROR']

                    # Add specific patterns for Save to Cache Lambda
                    if 'save-to-cache' in log_group_name or 'Save to Cache' in api_name:
                        error_patterns.extend([
                            'ClusterAllFailedError',
                            'Redis connection',
                            'ECONNREFUSED',
                            'ETIMEDOUT',
                            'Cannot read properties'
                        ])

                    # Try each error pattern
                    for pattern in error_patterns:
                        events_response = logs_client.filter_log_events(
                            logGroupName=log_group_name,
                            logStreamNames=[stream_name],
                            startTime=start_time,
                            endTime=end_time,
                            filterPattern=pattern
                        )

                        events = events_response.get('events', [])
                        if events:
                            print(f"DEBUG: Found {len(events)} '{pattern}' events in stream {stream_name}")
                            encoded_log_group = log_group_name.replace('/', '$252F')
                            encoded_stream_name = stream_name.replace('/', '$252F')
                            log_stream_url = f"https://console.aws.amazon.com/cloudwatch/home?region=eu-west-2#logsV2:log-groups/log-group/{encoded_log_group}/log-events/{encoded_stream_name}"
                            return log_stream_url

                    print(f"DEBUG: No error events found in stream {stream_name} with any pattern")

                except Exception as e:
                    print(f"DEBUG: Error checking events in stream {stream_name}: {e}")
                    continue

        # Fallback: return the most recent stream if no exact match
        if log_streams:
            stream_name = log_streams[0].get('logStreamName', '')
            if stream_name:
                print(f"DEBUG: Using fallback stream: {stream_name}")
                encoded_log_group = log_group_name.replace('/', '$252F')
                encoded_stream_name = stream_name.replace('/', '$252F')
                log_stream_url = f"https://console.aws.amazon.com/cloudwatch/home?region=eu-west-2#logsV2:log-groups/log-group/{encoded_log_group}/log-events/{encoded_stream_name}"
                return log_stream_url

    except Exception as e:
        print(f"DEBUG: Error getting log stream for {api_name}: {str(e)}")

    return None

def get_log_group_name_by_api(api_name, stage):
    """Get just the log group name (without URL) for an API"""

    api_to_log_group = {
        # Auctions Service APIs
        'API: /v1/auctions': f'/aws/lambda/auctions-{stage}-list_auction',
        'API: /v1/auctions POST': f'/aws/lambda/auctions-{stage}-create',
        'API: /v1/auctions GET': f'/aws/lambda/auctions-{stage}-list_auction',
        'API: /lots': f'/aws/lambda/auctions-{stage}-create_lots',
        'API: /lots GET': f'/aws/lambda/auctions-{stage}-list_lots',
        'API: /lots DELETE': f'/aws/lambda/auctions-{stage}-delete_lot',
        'API: /lots PATCH': f'/aws/lambda/auctions-{stage}-update_lot',
        'API: /view': f'/aws/lambda/auctions-{stage}-view',
        'API: /clone': f'/aws/lambda/auctions-{stage}-clone_auction',
        'API: /import': f'/aws/lambda/auctions-{stage}-import_lots',
        'API: /update': f'/aws/lambda/auctions-{stage}-update_auction',
        'API: /deactivate': f'/aws/lambda/auctions-{stage}-deactivate',
        
        # Buyers Service APIs
        'API: /view': f'/aws/lambda/buyers-{stage}-view',
        'API: /verify-captcha': f'/aws/lambda/buyers-{stage}-verify-recaptha',
        'API: /otp-validation': f'/aws/lambda/buyers-{stage}-otp-validation',
        'API: /view-lots': f'/aws/lambda/buyers-{stage}-view_lots',
        'API: /search-lots': f'/aws/lambda/buyers-{stage}-search_lots',
        'API: /lot-details': f'/aws/lambda/buyers-{stage}-view_lot_details',
        'API: /verify-card': f'/aws/lambda/buyers-{stage}-credit_card',
        'API: /approval': f'/aws/lambda/buyers-{stage}-acceting_buyer',
        'API: /update-password': f'/aws/lambda/buyers-{stage}-update_password',
        'API: /auction-register': f'/aws/lambda/buyers-{stage}-auction_register',
        'API: /profile': f'/aws/lambda/buyers-{stage}-view_profile',
        'API: /add-address': f'/aws/lambda/buyers-{stage}-add_address',
        'API: /paddle': f'/aws/lambda/buyers-{stage}-paddle_number',
        'API: /forgot_password': f'/aws/lambda/buyers-{stage}-send-reset-link',
        'API: /reset_password': f'/aws/lambda/buyers-{stage}-update-new-password',
        'API: /links': f'/aws/lambda/buyers-{stage}-footer-links',
        'API: /buyer-logs': f'/aws/lambda/buyers-{stage}-buyer-signin-logger',
        
        # Users Management Service APIs
        'API: /verify-captcha': f'/aws/lambda/users-management-{stage}-verify-recaptha',
        'API: /verify-captcha (Users)': f'/aws/lambda/users-management-{stage}-verify-recaptha',
        'API: /otp-validation': f'/aws/lambda/users-management-{stage}-otp-validation',
        'API: /otp-validation (Users)': f'/aws/lambda/users-management-{stage}-otp-validation',
        'API: /otp-validation (Buyers)': f'/aws/lambda/buyers-{stage}-otp-validation',
        'API: /request-otp': f'/aws/lambda/users-management-{stage}-request-otp',
        'API: /forgot_password': f'/aws/lambda/users-management-{stage}-send-reset-link',
        'API: /reset_password': f'/aws/lambda/users-management-{stage}-update-new-password',
        'API: /password-update': f'/aws/lambda/users-management-{stage}-update-password',
        'API: /generate': f'/aws/lambda/users-management-{stage}-generate_token',
        'API: /auth/login': f'/aws/lambda/users-management-{stage}-subdomain-callback',
        'API: /stripe': f'/aws/lambda/users-management-{stage}-stripe-connect',
        'API: /stripe PATCH': f'/aws/lambda/users-management-{stage}-disconnect_account',
        
        # Bids Service APIs
        'API: /update': f'/aws/lambda/bids-{stage}-add-to-group',
        'Bids List API': f'/aws/lambda/bids-{stage}-list',
        'Bids View API': f'/aws/lambda/bids-{stage}-view',
        
        # Payments Service APIs
        'API: /stripe': f'/aws/lambda/payments-{stage}-create_intent',
        'API: /payments_webhook': f'/aws/lambda/payments-{stage}-stripe_payments_webhook',
        
        # PayPal Service APIs
        'API: /paypal-order': f'/aws/lambda/paypal-{stage}-create-order',
        'API: /capture-order': f'/aws/lambda/paypal-{stage}-paypal-capture-order',
        'API: /paypal-connect': f'/aws/lambda/paypal-{stage}-paypal_connect',
        'API: /paypal-disconnect': f'/aws/lambda/paypal-{stage}-paypal-disconnect',
        
        # Cart Management Service APIs
        'API: /cart': f'/aws/lambda/cart-management-{stage}-view_cart',
        
        # Address Management Service APIs
        'API: /address': f'/aws/lambda/address-management-{stage}-add_shipping_address',
        'API: /address GET': f'/aws/lambda/address-management-{stage}-view_address',
        'API: /address PATCH': f'/aws/lambda/address-management-{stage}-update_address',
        
        # Buyer Wishlist Service APIs
        'API: /wishlist': f'/aws/lambda/buyer-wishlist-{stage}-wishlist-listing',
        'Wishlist Create API': f'/aws/lambda/buyer-wishlist-{stage}-create',
        'API: /remove': f'/aws/lambda/buyer-wishlist-{stage}-remove_wishlist',
        
        # Subdomain Service APIs
        'API: /subdomain': f'/aws/lambda/subdomain-{stage}-sub-domain',
        'Subdomain API': f'/aws/lambda/subdomain-{stage}-sub-domain',
        
        # Legacy mappings for backward compatibility
        'Buyer Verify Captcha API': f'/aws/lambda/buyers-{stage}-verify-recaptha',
        'Buyer OTP Validation API': f'/aws/lambda/buyers-{stage}-otp-validation',
        'Buyer Auth Login API': f'/aws/lambda/users-management-{stage}-generate_token',
        'Seller Verify Captcha API': f'/aws/lambda/users-management-{stage}-verify-recaptha',
        'Seller OTP Validation API': f'/aws/lambda/users-management-{stage}-otp-validation',
        'Seller Request OTP API': f'/aws/lambda/users-management-{stage}-request-otp',
        'Buyer Auction Register API': f'/aws/lambda/buyers-{stage}-auction_register',
        'Buyer Verify Card API': f'/aws/lambda/buyers-{stage}-credit_card',
        'Update Bid API': f'/aws/lambda/bids-{stage}-add-to-group',
        'Stripe Checkout API': f'/aws/lambda/payments-{stage}-create_intent',
        'PayPal Order API': f'/aws/lambda/paypal-{stage}-create-order',
        'PayPal Capture API': f'/aws/lambda/paypal-{stage}-paypal-capture-order',
        'Cart Management API': f'/aws/lambda/cart-management-{stage}-view_cart',
        'Create Auction API': f'/aws/lambda/auctions-{stage}-create',
        'Create Lot API': f'/aws/lambda/auctions-{stage}-create_lots',
        'Publish Auction API': f'/aws/lambda/auctions-{stage}-update_auction',
        'Buyers View API': f'/aws/lambda/buyers-{stage}-view',
        'Buyer View Lots API': f'/aws/lambda/buyers-{stage}-view_lots',
        'Buyer Lot Details API': f'/aws/lambda/buyers-{stage}-view_lot_details',
        'Buyer Paddle API': f'/aws/lambda/buyers-{stage}-paddle_number',
        'Seller Auctions View API': f'/aws/lambda/auctions-{stage}-view',
        'Seller Unpublish Auction API': f'/aws/lambda/auctions-{stage}-unpublish_auction',
        'Buyer Update Password API': f'/aws/lambda/buyers-{stage}-update_password',
        'Seller Update Password API': f'/aws/lambda/users-management-{stage}-update-password',
        'Buyer Forgot Password API': f'/aws/lambda/buyers-{stage}-send-reset-link',
        'Buyer Reset Password API': f'/aws/lambda/buyers-{stage}-update-new-password',
        'Seller Forgot Password API': f'/aws/lambda/users-management-{stage}-send-reset-link',
        'Seller Reset Password API': f'/aws/lambda/users-management-{stage}-update-new-password',
        'Buyer Profile API': f'/aws/lambda/buyers-{stage}-view_profile',
        'Buyer Address Post API': f'/aws/lambda/address-management-{stage}-add_shipping_address',
        'Buyer Address Get API': f'/aws/lambda/address-management-{stage}-view_address',
        
        # Lambda Functions
        'Process Cart Lambda': f'/aws/lambda/auctions-{stage}-process-cart',
        'Save to Cache Lambda': f'/aws/lambda/auctions-{stage}-save-to-cache',
        
        # Generic API categories
        'Payments API': f'/aws/lambda/payments-{stage}-create_intent',
        'Authentication API': f'/aws/lambda/subdomain-{stage}-sub-domain',
        'Viewing API': f'/aws/lambda/buyers-{stage}-view_lot_details',
        'Profile API': f'/aws/lambda/buyers-{stage}-send-reset-link'
    }

    return api_to_log_group.get(api_name, '')

def get_log_group_link_by_api_name(api_name):
    """Get CloudWatch logs link by API name"""

    stage = os.environ.get('STAGE', 'dev')

    # Comprehensive map of API names to actual Lambda function log groups
    api_to_log_group = {
        # Specific API endpoints - /v1/auctions has both GET (list_auction) and POST (create)
        'API: /v1/auctions': f'/aws/lambda/auctions-{stage}-list_auction',  # Default to GET (view/list)
        'API: /v1/auctions POST': f'/aws/lambda/auctions-{stage}-create',     # POST method (create)
        'API: /v1/auctions GET': f'/aws/lambda/auctions-{stage}-list_auction', # GET method (list)
        'API: /auctions': f'/aws/lambda/auctions-{stage}-view',
        # Authentication & Registration APIs
        'Subdomain API': f'/aws/lambda/subdomain-{stage}-sub-domain',
        'API: /subdomain': f'/aws/lambda/subdomain-{stage}-sub-domain',
        'Buyer Verify Captcha API': f'/aws/lambda/buyers-{stage}-verify-recaptha',
        'Buyer OTP Validation API': f'/aws/lambda/buyers-{stage}-otp-validation',
        'Buyer Auth Login API': f'/aws/lambda/users-management-{stage}-generate_token',
        'Seller Verify Captcha API': f'/aws/lambda/users-management-{stage}-verify-recaptha',
        'Seller OTP Validation API': f'/aws/lambda/users-management-{stage}-otp-validation',
        'Seller Request OTP API': f'/aws/lambda/users-management-{stage}-request-otp',
        'Buyer Auction Register API': f'/aws/lambda/buyers-{stage}-auction_register',
        'Buyer Verify Card API': f'/aws/lambda/buyers-{stage}-credit_card',

        # Payments & Bidding APIs
        'Update Bid API': f'/aws/lambda/bids-{stage}-add-to-group',
        'Stripe Checkout API': f'/aws/lambda/payments-{stage}-create_intent',
        'PayPal Order API': f'/aws/lambda/paypal-{stage}-create-order',
        'PayPal Capture API': f'/aws/lambda/paypal-{stage}-paypal-capture-order',
        'Cart Management API': f'/aws/lambda/cart-management-{stage}-view_cart',
        'Create Auction API': f'/aws/lambda/auctions-{stage}-create',
        'Create Lot API': f'/aws/lambda/auctions-{stage}-create_lots',
        'Publish Auction API': f'/aws/lambda/auctions-{stage}-update_auction',

        # Viewing & Management APIs
        'Buyers View API': f'/aws/lambda/buyers-{stage}-view',
        'Buyer View Lots API': f'/aws/lambda/buyers-{stage}-view_lots',
        'Buyer Lot Details API': f'/aws/lambda/buyers-{stage}-view_lot_details',
        'API: /lot-details': f'/aws/lambda/buyers-{stage}-view_lot_details',
        'Buyer Paddle API': f'/aws/lambda/buyers-{stage}-paddle_number',
        'Seller Auctions View API': f'/aws/lambda/auctions-{stage}-view',
        'Seller Unpublish Auction API': f'/aws/lambda/auctions-{stage}-unpublish_auction',

        # Profile Management APIs
        'API: /forgot_password': f'/aws/lambda/buyers-{stage}-send-reset-link',
        'API: /reset_password': f'/aws/lambda/buyers-{stage}-update-new-password',
        'Buyer Update Password API': f'/aws/lambda/buyers-{stage}-update_password',
        'Buyer Forgot Password API': f'/aws/lambda/buyers-{stage}-send-reset-link',
        'Buyer Reset Password API': f'/aws/lambda/buyers-{stage}-update-new-password',
        'Seller Forgot Password API': f'/aws/lambda/users-management-{stage}-send-reset-link',
        'Seller Reset Password API': f'/aws/lambda/users-management-{stage}-update-new-password',
        'Buyer Profile API': f'/aws/lambda/buyers-{stage}-view_profile',
        'Buyer Address Post API': f'/aws/lambda/address-management-{stage}-add_shipping_address',
        'Buyer Address Get API': f'/aws/lambda/address-management-{stage}-view_address',

        # Auction Management APIs
        'Seller Clone Auction API': f'/aws/lambda/auctions-{stage}-clone_auction',
        'Seller View Bidders API': f'/aws/lambda/bids-{stage}-view',
        'Seller Buyer Approval API': f'/aws/lambda/buyers-{stage}-acceting_buyer',
        'Seller Update Lot API': f'/aws/lambda/auctions-{stage}-update_lot',
        'Seller Delete Lot API': f'/aws/lambda/auctions-{stage}-delete_lot',
        'Seller Import Lots API': f'/aws/lambda/auctions-{stage}-import_lots',

        # Search & Wishlist APIs
        'Buyer Search Lots API': f'/aws/lambda/buyers-{stage}-search_lots',
        'Buyer Add Wishlist API': f'/aws/lambda/buyer-wishlist-{stage}-create',
        'Buyer Remove Wishlist API': f'/aws/lambda/buyer-wishlist-{stage}-remove_wishlist',
        'Buyer View Wishlist API': f'/aws/lambda/buyer-wishlist-{stage}-wishlist-listing',
        'Seller Export Data API': f'/aws/lambda/orders-{stage}-seller_list_orders',
        'Seller Newsletter Get API': f'/aws/lambda/newsletter-{stage}-update',

        # Lambda Functions
        'Process Cart Lambda': f'/aws/lambda/auctions-{stage}-process-cart',
        'Save to Cache Lambda': f'/aws/lambda/auctions-{stage}-save-to-cache',
        
        # Generic API categories - use most common API for each
        'Payments API': f'/aws/lambda/payments-{stage}-create_intent',
        'Authentication API': f'/aws/lambda/subdomain-{stage}-sub-domain',
        'Viewing API': f'/aws/lambda/buyers-{stage}-view_lot_details',
        'Profile API': f'/aws/lambda/buyers-{stage}-send-reset-link'
    }

    log_group = api_to_log_group.get(api_name, '')
    if log_group:
        return f"https://console.aws.amazon.com/cloudwatch/home?region=eu-west-2#logsV2:log-groups/log-group/{log_group.replace('/', '$252F')}"
    return ""

def parse_failed_api(alarm_name, reason):
    """Parse which API failed from alarm name and reason"""

    print(f"DEBUG: Parsing failed API - Alarm: {alarm_name}, Reason: {reason}")

    # Map alarm names to API categories
    if 'auth' in alarm_name.lower():
        # P1 Critical - Auth & Registration alarm
        if 'subdomain' in reason.lower() or 'subdomain_api' in reason.lower() or 'sub-domain' in reason.lower():
            return 'Subdomain API', get_log_group_link('subdomain_api')
        elif 'buyer_verify_captcha' in reason.lower() or 'verify-recaptha' in reason.lower() or 'captcha' in reason.lower():
            return 'Buyer Verify Captcha API', get_log_group_link('buyer_verify_captcha')
        elif 'buyer_otp_validation' in reason.lower() or 'otp-validation' in reason.lower() or 'otp validation' in reason.lower():
            return 'Buyer OTP Validation API', get_log_group_link('buyer_otp_validation')
        elif 'buyer_auth_login' in reason.lower() or 'generate_token' in reason.lower() or 'auth login' in reason.lower():
            return 'Buyer Auth Login API', get_log_group_link('buyer_auth_login')
        elif 'seller_verify_captcha' in reason.lower() or 'seller' in reason.lower() and 'captcha' in reason.lower():
            return 'Seller Verify Captcha API', get_log_group_link('seller_verify_captcha')
        elif 'seller_otp_validation' in reason.lower() or 'seller' in reason.lower() and 'otp' in reason.lower():
            return 'Seller OTP Validation API', get_log_group_link('seller_otp_validation')
        elif 'seller_request_otp' in reason.lower() or 'request-otp' in reason.lower():
            return 'Seller Request OTP API', get_log_group_link('seller_request_otp')
        elif 'buyer_auction_register' in reason.lower() or 'auction_register' in reason.lower() or 'auction register' in reason.lower():
            return 'Buyer Auction Register API', get_log_group_link('buyer_auction_register')
        elif 'buyer_verify_card' in reason.lower() or 'credit_card' in reason.lower() or 'verify card' in reason.lower():
            return 'Buyer Verify Card API', get_log_group_link('buyer_verify_card')
        else:
            return 'Authentication/Registration API (Unknown specific endpoint)', ''

    elif 'payments' in alarm_name.lower():
        # P1 Critical - Payments & Bidding alarm
        if 'buyer_bids_update' in reason.lower() or 'update bid api' in reason.lower() or 'bids' in reason.lower():
            return 'Update Bid API', get_log_group_link('buyer_bids_update')
        elif 'stripe_checkout' in reason.lower() or 'stripe' in reason.lower() or 'create_intent' in reason.lower():
            return 'Stripe Checkout API', get_log_group_link('stripe_checkout')
        elif 'paypal_order' in reason.lower() or 'paypal' in reason.lower() and 'order' in reason.lower():
            return 'PayPal Order API', get_log_group_link('paypal_order')
        elif 'paypal_capture' in reason.lower() or 'paypal' in reason.lower() and 'capture' in reason.lower():
            return 'PayPal Capture API', get_log_group_link('paypal_capture')
        elif 'cart_management' in reason.lower() or 'cart' in reason.lower():
            return 'Cart Management API', get_log_group_link('cart_management')
        elif 'seller_create_auction' in reason.lower() or 'create auction api' in reason.lower() or 'create auction' in reason.lower():
            return 'Create Auction API', get_log_group_link('seller_create_auction')
        elif 'seller_create_lot' in reason.lower() or 'create lot api' in reason.lower() or 'create_lots' in reason.lower():
            return 'Create Lot API', get_log_group_link('seller_create_lot')
        elif 'seller_publish_auction' in reason.lower() or 'publish auction api' in reason.lower() or 'update_auction' in reason.lower():
            return 'Publish Auction API', get_log_group_link('seller_publish_auction')
        else:
            return 'Payments/Bidding API (Unknown specific endpoint)', ''

    elif 'viewing' in alarm_name.lower():
        # P1 Critical - Viewing & Management alarm
        if 'buyer_view_lots' in reason.lower() or 'view_lots' in reason.lower() or 'view lots' in reason.lower():
            return 'Buyer View Lots API', get_log_group_link('buyer_view_lots')
        elif 'buyer_lot_details' in reason.lower() or 'view_lot_details' in reason.lower() or 'lot-details' in reason.lower() or 'lot details' in reason.lower():
            return 'Buyer Lot Details API', get_log_group_link('buyer_lot_details')
        elif 'buyer_view' in reason.lower() or 'buyers view' in reason.lower():
            return 'Buyers View API', get_log_group_link('buyer_view')
        elif 'buyer_paddle' in reason.lower() or 'paddle_number' in reason.lower() or 'paddle' in reason.lower():
            return 'Buyer Paddle API', get_log_group_link('buyer_paddle')
        elif 'seller_auctions_view' in reason.lower() or 'auctions view' in reason.lower():
            return 'Seller Auctions View API', get_log_group_link('seller_auctions_view')
        elif 'seller_unpublish_auction' in reason.lower() or 'unpublish_auction' in reason.lower() or 'unpublish auction' in reason.lower():
            return 'Seller Unpublish Auction API', get_log_group_link('seller_unpublish_auction')
        else:
            return 'Viewing/Management API (Unknown specific endpoint)', ''

    elif 'profile' in alarm_name.lower():
        # P2 Medium - Profile Management
        if 'buyer_forgot_password' in reason.lower() or 'send-reset-link' in reason.lower() or 'forgot_password' in reason.lower() or 'forgot password' in reason.lower():
            return 'Buyer Forgot Password API', get_log_group_link('buyer_forgot_password')
        elif 'buyer_reset_password' in reason.lower() or 'update-new-password' in reason.lower() or 'reset_password' in reason.lower() or 'reset password' in reason.lower():
            return 'Buyer Reset Password API', get_log_group_link('buyer_reset_password')
        elif 'buyer_update_password' in reason.lower() or 'update_password' in reason.lower() or 'update password' in reason.lower():
            return 'Buyer Update Password API', get_log_group_link('buyer_update_password')
        elif 'seller_forgot_password' in reason.lower() or 'seller' in reason.lower() and 'forgot' in reason.lower():
            return 'Seller Forgot Password API', get_log_group_link('seller_forgot_password')
        elif 'seller_reset_password' in reason.lower() or 'seller' in reason.lower() and 'reset' in reason.lower():
            return 'Seller Reset Password API', get_log_group_link('seller_reset_password')
        elif 'buyer_profile' in reason.lower() or 'view_profile' in reason.lower() or 'profile' in reason.lower():
            return 'Buyer Profile API', get_log_group_link('buyer_profile')
        elif 'buyer_address_post' in reason.lower() or 'add_shipping_address' in reason.lower() or 'address post' in reason.lower():
            return 'Buyer Address Post API', get_log_group_link('buyer_address_post')
        elif 'buyer_address_get' in reason.lower() or 'view_address' in reason.lower() or 'address get' in reason.lower():
            return 'Buyer Address Get API', get_log_group_link('buyer_address_get')
        else:
            return 'Profile Management API (Unknown specific endpoint)', ''

    elif 'management' in alarm_name.lower():
        # P2 Medium - Auction Management
        if 'seller_clone_auction' in reason.lower() or 'clone_auction' in reason.lower() or 'clone auction' in reason.lower():
            return 'Seller Clone Auction API', get_log_group_link('seller_clone_auction')
        elif 'seller_view_bidders' in reason.lower() or 'view bidders' in reason.lower() or 'bidders' in reason.lower():
            return 'Seller View Bidders API', get_log_group_link('seller_view_bidders')
        elif 'seller_buyer_approval' in reason.lower() or 'acceting_buyer' in reason.lower() or 'buyer approval' in reason.lower():
            return 'Seller Buyer Approval API', get_log_group_link('seller_buyer_approval')
        elif 'seller_update_lot' in reason.lower() or 'update_lot' in reason.lower() or 'update lot' in reason.lower():
            return 'Seller Update Lot API', get_log_group_link('seller_update_lot')
        elif 'seller_delete_lot' in reason.lower() or 'delete_lot' in reason.lower() or 'delete lot' in reason.lower():
            return 'Seller Delete Lot API', get_log_group_link('seller_delete_lot')
        elif 'seller_import_lots' in reason.lower() or 'import_lots' in reason.lower() or 'import lots' in reason.lower():
            return 'Seller Import Lots API', get_log_group_link('seller_import_lots')
        else:
            return 'Auction Management API (Unknown specific endpoint)', ''

    elif 'search' in alarm_name.lower():
        # P3 Low - Search & Wishlist
        if 'buyer_search_lots' in reason.lower() or 'search_lots' in reason.lower() or 'search lots' in reason.lower():
            return 'Buyer Search Lots API', get_log_group_link('buyer_search_lots')
        elif 'buyer_add_wishlist' in reason.lower() or 'wishlist create' in reason.lower() or 'add wishlist' in reason.lower():
            return 'Buyer Add Wishlist API', get_log_group_link('buyer_add_wishlist')
        elif 'buyer_remove_wishlist' in reason.lower() or 'remove_wishlist' in reason.lower() or 'remove wishlist' in reason.lower():
            return 'Buyer Remove Wishlist API', get_log_group_link('buyer_remove_wishlist')
        elif 'buyer_view_wishlist' in reason.lower() or 'wishlist-listing' in reason.lower() or 'view wishlist' in reason.lower():
            return 'Buyer View Wishlist API', get_log_group_link('buyer_view_wishlist')
        elif 'seller_export_data' in reason.lower() or 'seller_list_orders' in reason.lower() or 'export data' in reason.lower():
            return 'Seller Export Data API', get_log_group_link('seller_export_data')
        elif 'seller_newsletter_get' in reason.lower() or 'newsletter' in reason.lower():
            return 'Seller Newsletter Get API', get_log_group_link('seller_newsletter_get')
        else:
            return 'Search/Wishlist API (Unknown specific endpoint)', ''

    # Fallback: comprehensive pattern matching for any API regardless of alarm category
    api_patterns = [
        # Authentication patterns
        ('subdomain', 'Subdomain API', 'subdomain_api'),
        ('sub-domain', 'Subdomain API', 'subdomain_api'),
        ('verify-recaptha', 'Buyer Verify Captcha API', 'buyer_verify_captcha'),
        ('captcha', 'Buyer Verify Captcha API', 'buyer_verify_captcha'),
        ('otp-validation', 'Buyer OTP Validation API', 'buyer_otp_validation'),
        ('generate_token', 'Buyer Auth Login API', 'buyer_auth_login'),
        ('request-otp', 'Seller Request OTP API', 'seller_request_otp'),
        ('auction_register', 'Buyer Auction Register API', 'buyer_auction_register'),
        ('credit_card', 'Buyer Verify Card API', 'buyer_verify_card'),
        
        # Payment patterns
        ('create_intent', 'Stripe Checkout API', 'stripe_checkout'),
        ('stripe', 'Stripe Checkout API', 'stripe_checkout'),
        ('create-order', 'PayPal Order API', 'paypal_order'),
        ('paypal-capture-order', 'PayPal Capture API', 'paypal_capture'),
        ('view_cart', 'Cart Management API', 'cart_management'),
        ('add-to-group', 'Update Bid API', 'buyer_bids_update'),
        
        # Auction patterns
        ('/v1/auctions', 'Seller Auctions View API', 'seller_auctions_view'),
        ('/auctions', 'Seller Auctions View API', 'seller_auctions_view'),
        ('create auction', 'Create Auction API', 'seller_create_auction'),
        ('create_lots', 'Create Lot API', 'seller_create_lot'),
        ('update_auction', 'Publish Auction API', 'seller_publish_auction'),
        ('clone_auction', 'Seller Clone Auction API', 'seller_clone_auction'),
        ('update_lot', 'Seller Update Lot API', 'seller_update_lot'),
        ('delete_lot', 'Seller Delete Lot API', 'seller_delete_lot'),
        ('import_lots', 'Seller Import Lots API', 'seller_import_lots'),
        ('unpublish_auction', 'Seller Unpublish Auction API', 'seller_unpublish_auction'),
        
        # Viewing patterns
        ('view_lot_details', 'Buyer Lot Details API', 'buyer_lot_details'),
        ('lot-details', 'Buyer Lot Details API', 'buyer_lot_details'),
        ('view_lots', 'Buyer View Lots API', 'buyer_view_lots'),
        ('paddle_number', 'Buyer Paddle API', 'buyer_paddle'),
        
        # Profile patterns
        ('send-reset-link', 'Buyer Forgot Password API', 'buyer_forgot_password'),
        ('update-new-password', 'Buyer Reset Password API', 'buyer_reset_password'),
        ('update_password', 'Seller Update Password API', 'seller_update_password'),
        ('password-update', 'Seller Update Password API', 'seller_update_password'),
        ('view_profile', 'Buyer Profile API', 'buyer_profile'),
        ('add_shipping_address', 'Buyer Address Post API', 'buyer_address_post'),
        ('view_address', 'Buyer Address Get API', 'buyer_address_get'),
        
        # Wishlist patterns
        ('search_lots', 'Buyer Search Lots API', 'buyer_search_lots'),
        ('wishlist create', 'Buyer Add Wishlist API', 'buyer_add_wishlist'),
        ('remove_wishlist', 'Buyer Remove Wishlist API', 'buyer_remove_wishlist'),
        ('wishlist-listing', 'Buyer View Wishlist API', 'buyer_view_wishlist'),
        ('seller_list_orders', 'Seller Export Data API', 'seller_export_data'),
        ('newsletter', 'Seller Newsletter Get API', 'seller_newsletter_get'),
        
        # Bidding patterns
        ('acceting_buyer', 'Seller Buyer Approval API', 'seller_buyer_approval'),
    ]
    
    # Check each pattern
    for pattern, name, api_id in api_patterns:
        if pattern in reason.lower():
            return name, get_log_group_link(api_id)

    return f"Unknown API (Alarm: {alarm_name})", ""

def get_log_group_link(api_id):
    """Get direct CloudWatch log group link for specific Lambda function"""

    stage = os.environ.get('STAGE', 'prod')

    # Map API IDs to Lambda function log groups (matching actual function names)
    log_group_map = {
        # P1 Critical - Auth & Registration
        'buyer_verify_captcha': f'/aws/lambda/buyers-{stage}-verify-recaptha',
        'buyer_otp_validation': f'/aws/lambda/buyers-{stage}-otp-validation',
        'buyer_auth_login': f'/aws/lambda/users-management-{stage}-generate_token',
        'seller_verify_captcha': f'/aws/lambda/users-management-{stage}-verify-recaptha',
        'seller_otp_validation': f'/aws/lambda/users-management-{stage}-otp-validation',
        'seller_request_otp': f'/aws/lambda/users-management-{stage}-request-otp',
        'buyer_auction_register': f'/aws/lambda/buyers-{stage}-auction_register',
        'buyer_verify_card': f'/aws/lambda/buyers-{stage}-credit_card',

        # P1 Critical - Payments & Bidding
        'buyer_bids_update': f'/aws/lambda/bids-{stage}-add-to-group',
        'stripe_checkout': f'/aws/lambda/payments-{stage}-create_intent',
        'paypal_order': f'/aws/lambda/paypal-{stage}-create-order',
        'paypal_capture': f'/aws/lambda/paypal-{stage}-paypal-capture-order',
        'cart_management': f'/aws/lambda/cart-management-{stage}-view_cart',
        'seller_create_auction': f'/aws/lambda/auctions-{stage}-create',
        'seller_create_lot': f'/aws/lambda/auctions-{stage}-create_lots',
        'seller_publish_auction': f'/aws/lambda/auctions-{stage}-update_auction',

        # P1 Critical - Viewing & Management
        'buyer_view': f'/aws/lambda/buyers-{stage}-view',
        'buyer_view_lots': f'/aws/lambda/buyers-{stage}-view_lots',
        'buyer_lot_details': f'/aws/lambda/buyers-{stage}-view_lot_details',
        'buyer_paddle': f'/aws/lambda/buyers-{stage}-paddle_number',
        'seller_auctions_view': f'/aws/lambda/auctions-{stage}-view',
        'seller_unpublish_auction': f'/aws/lambda/auctions-{stage}-unpublish_auction',

        # P2 Medium - Profile Management
        'buyer_update_password': f'/aws/lambda/buyers-{stage}-update_password',
        'seller_update_password': f'/aws/lambda/users-management-{stage}-update-password',
        'buyer_forgot_password': f'/aws/lambda/buyers-{stage}-send-reset-link',
        'buyer_reset_password': f'/aws/lambda/users-{stage}-update-new-password',
        'seller_forgot_password': f'/aws/lambda/users-management-{stage}-send-reset-link',
        'seller_reset_password': f'/aws/lambda/users-management-{stage}-update-new-password',
        'buyer_profile': f'/aws/lambda/buyers-{stage}-view_profile',
        'buyer_address_post': f'/aws/lambda/address-management-{stage}-add_shipping_address',
        'buyer_address_get': f'/aws/lambda/address-management-{stage}-view_address',

        # P2 Medium - Auction Management
        'seller_clone_auction': f'/aws/lambda/auctions-{stage}-clone_auction',
        'seller_view_bidders': f'/aws/lambda/bids-{stage}-view',
        'seller_buyer_approval': f'/aws/lambda/buyers-{stage}-acceting_buyer',
        'seller_update_lot': f'/aws/lambda/auctions-{stage}-update_lot',
        'seller_delete_lot': f'/aws/lambda/auctions-{stage}-delete_lot',
        'seller_import_lots': f'/aws/lambda/auctions-{stage}-import_lots',

        # P3 Low - Search & Wishlist
        'buyer_search_lots': f'/aws/lambda/buyers-{stage}-search_lots',
        'buyer_add_wishlist': f'/aws/lambda/buyer-wishlist-{stage}-create',
        'buyer_remove_wishlist': f'/aws/lambda/buyer-wishlist-{stage}-remove_wishlist',
        'buyer_view_wishlist': f'/aws/lambda/buyer-wishlist-{stage}-wishlist-listing',
        'seller_export_data': f'/aws/lambda/orders-{stage}-seller_list_orders',
        'seller_newsletter_get': f'/aws/lambda/newsletter-{stage}-update',
        'subdomain_api': f'/aws/lambda/subdomain-{stage}-sub-domain'
    }

    log_group = log_group_map.get(api_id, '')
    if log_group:
        return f"https://console.aws.amazon.com/cloudwatch/home?region=eu-west-2#logsV2:log-groups/log-group/{log_group.replace('/', '$252F')}"
    return ""
