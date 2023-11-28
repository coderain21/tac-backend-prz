import stripe

# Set your Stripe API key for the connected account
stripe.api_key = 'sk_test_51NSrthFdWS7wL4EMgIaIlyzCIPY2387pcfibXJdCWsVJWg1dHrjAHZIoeKTrOCNcUNqkAmEuGNQti3q0mcE3hThb00CCZpfg5S'

def get_payment_details(payment_intent_id):
    try:
        # Retrieve the payment intent using the connected account
        payment_intent = stripe.PaymentIntent.retrieve(
            payment_intent_id,
            stripe_account='acct_1Nknf8C5wvaI16p7'
        )

        payment_method = payment_intent.payment_method

        # print(payment_intent)
        # Print or use the information as needed
        payment_method = stripe.PaymentMethod.retrieve(payment_intent.payment_method,
                                                       stripe_account='acct_1Nknf8C5wvaI16p7')
        print(payment_method)
        # Return the information as a dictionary or any other format as needed
        return {
            
        }

    except stripe.error.StripeError as e:
        print(f"Error: {e}")
        return None

# Example usage
payment_intent_id = 'pi_3OHNzqC5wvaI16p70A5e8uQc'  # Replace with your actual Payment Intent ID
payment_details = get_payment_details(payment_intent_id)

if payment_details:
    # Do something with the payment details
    pass
