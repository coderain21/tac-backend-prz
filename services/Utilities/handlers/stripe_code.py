"""This module is used for stripe demonstration"""
# Set your secret key. Remember to switch to your live secret key in production.
# See your keys here: https://dashboard.stripe.com/apikeys
# import stripe
import stripe
import os
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]


def main():
    # response = stripe.checkout.Session.create(
    # mode="payment",
    # line_items=[{"price": "price_1NbHCJFdWS7wL4EMwAvdUgcz", "quantity": 1}],
    # payment_intent_data={
    #     "application_fee_amount": 123,
    #     "transfer_data": {"destination": "acct_1NbIPVCHsBwuF67e"},
    # },
    # success_url="https://example.com/success",
    # cancel_url="https://example.com/cancel",
    # )
    response = stripe.checkout.Session.create(
        mode="payment",
        line_items=[
            {"price": "price_1NbK18FdWS7wL4EMEEsUUNUM", "quantity": 1}],
        success_url="https://example.com/success",
        cancel_url="https://example.com/cancel",
    )
    # response=stripe.PaymentIntent.create(
    #     amount=100000,
    #     currency="usd",
    #     automatic_payment_methods={"enabled": True},

    #     transfer_data={"destination": 'acct_1NbIPVCHsBwuF67e'},
    #     )
    print(response)
    response = stripe.PaymentIntent.create(
        amount=10000,
        currency="GBP",
        automatic_payment_methods={"enabled": True},
        application_fee_amount=123,
        transfer_data={"destination": 'acct_1NbIPVCHsBwuF67e'},
    )
    print(response)


if __name__ == "__main__":
    main()
