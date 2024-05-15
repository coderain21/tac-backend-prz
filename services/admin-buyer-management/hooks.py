'''This is hooks file for admin-buyer-management service'''
from dredd_hooks import before_each, after_each
import os
import json
import logging
import urllib.parse

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    filename='hooks.log',
    filemode='a'
)


@after_each
def skip_404_test_results(transaction):
    if (
        transaction['expected']['statusCode'] == '500' or
        transaction['expected']['statusCode'] == '404' or
        transaction['expected']['statusCode'] == '403' or
        '/659cf1def0d3374201bac434'  in transaction['request']['uri']




    ):
        transaction['skip'] = True


@before_each
def set_authorization(transaction):
    token = str(os.environ.get('ADMIN'))

    transaction['request']['uri'] = urllib.parse.unquote(
        transaction['request']['uri'])

    if transaction['expected']['statusCode'] != '401':
        transaction['request']['headers']['Authorization'] = f'Bearer {token}'


    if transaction['expected']['statusCode'] == '400':
        transaction['request']['body'] = json.dumps({
            "first_name": "Sandhya",
            "last_name": "s",
            "user_type": "seller",
            "last_name": "V B",
            "website": "647837fb11c55cf90b4b70e6",
            "branches": "*",
            "user_type": "institution-user",
            "institution_id": "646da9f3146f9d633b7c4830",
            "status": "active",
        })

    if (
        transaction['expected']['statusCode'] == '200' or
        transaction['expected']['statusCode'] == '204'
    ):
        logging.info(transaction)
        transaction['request']['uri'] = urllib.parse.unquote(
            transaction['request']['uri'])
        logging.info(transaction['request'])
