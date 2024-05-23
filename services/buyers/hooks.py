'''This is hooks file for buyers service'''
from dredd_hooks import before_each, after_each
import os
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
        transaction['expected']['statusCode'] == '400' or
        '/verify-captcha' in transaction['request']['uri'] or
        '/otp-validation' in transaction['request']['uri'] or
        '/www-dev' in transaction['request']['uri'] or
        '/auction-register' in transaction['request']['uri'] or
        '/update-password' in transaction['request']['uri'] or
        '/reset_password' in transaction['request']['uri'] or
        '/verify-card' in transaction['request']['uri'] or
        '/forgot_password' in transaction['request']['uri']
    ):
        transaction['skip'] = True


@before_each
def set_authorization(transaction):
    if '/approval' in transaction['request']['uri']:
        token = str(os.environ.get('USER'))
    else:
        token = str(os.environ.get('BUYERS'))
    print('s', transaction['expected']['statusCode'] == '400')
    transaction['request']['uri'] = urllib.parse.unquote(
        transaction['request']['uri'])

    if transaction['expected']['statusCode'] != '401':
        transaction['request']['headers']['Authorization'] = f'Bearer {token}'


    # if transaction['expected']['statusCode'] == '400':
    #     transaction['request']['body'] = json.dumps({
    #         "template_name": 3,
    #     })
    if (
        transaction['request']['method'] == 'PATCH' and
        '/approval' in transaction['request']['uri']
    ):
        print('Skipping the test...')
        transaction['skip'] = True
        return
    if (
        transaction['request']['method'] == 'POST' and
        '/forgot_password' in transaction['request']['uri']
    ):
        print('Skipping the test...')
        transaction['skip'] = True
        return
    if (
        transaction['expected']['statusCode'] == '200' or
        transaction['expected']['statusCode'] == '204'
    ):
        logging.info(transaction)
        transaction['request']['uri'] = urllib.parse.unquote(
            transaction['request']['uri'])
        logging.info(transaction['request'])


    if (
        transaction['request']['method'] == 'POST' and
        '/forgot_password' in transaction['request']['uri']
    ):
        print('Skipping the test...')
        transaction['skip'] = True
        return

    if (
        transaction['request']['method'] == 'PATCH' and
        '/approval' in transaction['request']['uri']
    ):
        print('Skipping the test...')
        transaction['skip'] = True
        return
