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
        transaction['expected']['statusCode'] == '400'
    ):
        transaction['skip'] = True


@before_each
def set_authorization(transaction):
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
        transaction['expected']['statusCode'] == '200' or
        transaction['expected']['statusCode'] == '204'
    ):
        logging.info(transaction)
        transaction['request']['uri'] = urllib.parse.unquote(
            transaction['request']['uri'])
        logging.info(transaction['request'])
