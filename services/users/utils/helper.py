"""
This module contains helper functions for password reset functionality .
"""
import os
import datetime
import jwt
from lib.email_helper import send_mail

from schema import Schema
jwt_secret = os.environ.get('JWT_SECRET_KEY')
dt = datetime.datetime.now() + datetime.timedelta(minutes=10)

def send_mail_reset_password(email_address):
    """
    Sends a password reset email to the specified email address.

    Args:
        email_address: The email address to send the reset email to.
    """
    token = jwt.encode({"email_address": email_address,'exp': dt}, jwt_secret, algorithm="HS256")
    print(token)
    # token = str(token)[2:-1]
    token = str(token)
    baseurl = "http://"+os.environ.get('BASE_URL_SELLER', os.environ.get('RESET_BASE_URL'))
    router = os.environ.get('VERIFY_TOKEN_ROUTER_URL', "/verify_token")
    link = str(baseurl) + str(router) + '?token=' + str(token)
    print("---",link)
    template=os.environ['FORGOT_PASSWORD_EMAIL_TEMPLATE_SELLER']

    send_mail(link,template,email_address,token)
    return token

admin_password_reset_schema = Schema({'token': str,
                                    'password': str,'encrypted_password': str})

def encode_password(password):
    """
    Encodes the password using a specific algorithm.

    Args:
        password: The password to encode.

    Returns:
        The encoded password.
    """
    # # Prepare the command to run the Node.js script
    # key=os.environ['JWT_SECRET_KEY']
    # node_script = '''
    # const CryptoJS = require('crypto-js');
    # const password = '{password}';
    # const key = 'sarvesh';
    # const encryptedPassword = CryptoJS.AES.encrypt(password, '{key}').toString();
    # console.log('Encrypted Password:', encryptedPassword);
    # '''.format(password=password,key=key)
    # # print("node script--->",node_script)
    # # Execute the Node.js script using subprocess
    # result = subprocess.run(['node', '-e', node_script], capture_output=True, text=True)

    # # Parse the output from the Node.js script
    # output = result.stdout.strip()
    # print("--->",output)
    # encrypted_password = output.split(': ')[1]

    return password
