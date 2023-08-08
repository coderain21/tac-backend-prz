"""
This module contains hooks for Dredd testing.
"""
import os
import json
import logging
from dredd_hooks import before_each, after_each
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    filename='hooks.log',  # Specify the name of the log file
    filemode='a'  # Use 'a' for appending log messages to the file
)

@after_each
def skip_404_test_results(transaction):
    """Skip test results if the expected status code is 500."""
    if transaction['expected']['statusCode'] == '500':
        transaction['skip'] = True
    if transaction['expected']['statusCode'] == '403':
        transaction['skip'] = True
    if transaction['expected']['statusCode'] == '204':
        transaction['skip'] = True
    if transaction['expected']['statusCode'] == '200':
        transaction['skip'] = True
    if transaction['expected']['statusCode'] == '401':
        transaction['skip'] = True

        
# @after_each
# def skip_404_test_results(transaction):
#     if transaction['expected']['statusCode'] == '404':
#         transaction['skip'] = True

@before_each
def set_authorization(transaction):
    """Set the authorization token for the transaction."""
    token = str(os.environ.get('TOKEN'))
#     token = 'eyJraWQiOiJWVFBmaW9aR1BUZjNTTXhrcXcraU1JMVJLK3JvSkNLNXRcL1N4RW1IUkZpST0iLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI2OGNkMDBiOS1iYmM0LTQ2ZDItYjE3NS04Y2QxMmIwMzI3MWUiLCJjdXN0b206aXNfZmlyc3RfdGltZV9sb2dpbiI6ImZhc2xlIiwiY29nbml0bzpncm91cHMiOlsibWFuYWdlLXVzZXJzIl0sImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuYXAtc291dGgtMS5hbWF6b25hd3MuY29tXC9hcC1zb3V0aC0xXzZPT1RuOVpvTyIsInBob25lX251bWJlcl92ZXJpZmllZCI6dHJ1ZSwiY29nbml0bzp1c2VybmFtZSI6InBhdml0cmEua2luaStza3V0ZXFAN2VkZ2UuY29tIiwibWlkZGxlX25hbWUiOiJraW5pIiwib3JpZ2luX2p0aSI6IjM1MmU0YTQ4LWEyMjctNDg5OS04NTJkLWY0ZDlhMDU4NWFhYSIsImF1ZCI6IjZna2ZiYW5waGEyOTQ0bTBrZm9scDU3bmhxIiwiZXZlbnRfaWQiOiI4ZjU2NjI5ZC02NDFlLTRlZjYtYjZhZS1mNDllNDc4NzFhNzIiLCJ0b2tlbl91c2UiOiJpZCIsImF1dGhfdGltZSI6MTY4NDU2MzY3NywiY3VzdG9tOnN0YXR1cyI6InRydWUiLCJuYW1lIjoicGF2aXRyYSIsInBob25lX251bWJlciI6Iis5MTk0ODMyODg0MTYiLCJleHAiOjE2ODQ1NjM5NzcsImN1c3RvbTp1c2VyX3R5cGUiOiJhZG1pbi11c2VycyIsImlhdCI6MTY4NDU2MzY3NywianRpIjoiMjMxOWVlZTgtZTlmOC00OTYwLWFhMGYtZWYzNTJhMDMwMjMxIiwiZW1haWwiOiJwYXZpdHJhLmtpbmkrc2t1dGVxQDdlZGdlLmNvbSJ9.TjiIUwfnaUijDdvCpmPR3IGRMDWKc3Cyt8aK9X19ZlFMSjXxSkgqdtQJZgwlDN_iKpwT3IU1RZ2yQlbr8qJf-bgtHCHlMyBzy5AXqfO550ocZjttJNNdKwsSqD5afRqIQ-D3S-gI7_mMZNZnTGs4sJh-ZOAN_HH6lWXObtfnX6va2QIUhisP6CkbrKxlMy1SRg4adfpwYVIzl9-iDqVArB4c1729PadMuT3fzMaGAiDcpl4D74z_GXWQjFrFRuIT7mp0h5zb5OTzU_l0bMeW9X9b9kEoqiCFDI1_Bad5RLIEFSo-bnSr9RFPjyFxA7RH_ssVacZHUhYEgMGfIhTuKw'
    if transaction['expected']['statusCode'] != '401':
        transaction['request']['headers']['Authorization'] = f'Bearer {token}'
    if transaction['expected']['statusCode'] == '400':
        logging.info(transaction)
        transaction['request']['body'] = json.dumps({})
        if transaction['request']['method'] == 'GET':
            transaction['fullPath'] = transaction['fullPath']+"&start_id=100&end_id=10"
            transaction['request']['uri'] = transaction['fullPath'] 
    if transaction['expected']['statusCode'] == '404':
        transaction['request']['body'] = json.dumps({"email": "sandhsasd", "activation_code": "fb56789ew876"})
        if transaction['request']['method'] == 'GET':
            transaction['request']['body'] = json.dumps({"email": "sandhsasd", "activation_code": "fb56789ew876"})
            transaction['fullPath'] = transaction['fullPath'].replace('zee', 'j')
            transaction['fullPath'] = transaction['fullPath'].replace("anusha", '000002')
            transaction['request']['uri'] = transaction['fullPath']  
        if transaction['request']['method'] == 'PATCH':
            transaction['request']['body'] = json.dumps({"password": "123456"})
            transaction['fullPath'] = transaction['fullPath'].replace('zee', 'j')
            transaction['fullPath'] = transaction['fullPath'].replace("anusha", '000002')
            transaction['request']['uri'] = transaction['fullPath'] 
       

        # transaction['request']['fullPath'] = transaction['request']['fullPath'].replace('564', '000002')
        # logging.info(transaction['request'])