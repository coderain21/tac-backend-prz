VPC Peering Setup
This guide outlines the steps to establish a VPC peering connection between two AWS accounts. The process involves sending a peering request from the source account to the destination account, accepting the request from the destination account, and configuring the route tables and security groups in both accounts.

Steps to Setup VPC Peering
1. Send VPC Peering Request from Source Account
Login to AWS Console: Ensure you are logged in to the AWS Management Console of the source account.
Navigate to VPC Dashboard: Go to the VPC service dashboard.
Create Peering Connection:
Click on "Peering Connections" in the left-hand menu.
Click on "Create Peering Connection".
Fill in the required details:
Peering Connection Name: Provide a name for the peering connection.
VPC (Requester): Select the VPC from the source account.
Account: Select "Another AWS Account" and enter the Account ID of the destination account.
VPC (Accepter): Enter the VPC ID from the destination account.
Click "Create Peering Connection".
2. Accept VPC Peering Request in Destination Account
Login to AWS Console: Ensure you are logged in to the AWS Management Console of the destination account.
Navigate to VPC Dashboard: Go to the VPC service dashboard.
Accept Peering Connection:
Click on "Peering Connections" in the left-hand menu.
Select the pending peering connection request.
Click "Actions" and select "Accept Request".
Confirm the acceptance.
3. Update Route Tables in Source Account
Navigate to Route Tables: In the VPC dashboard of the source account, click on "Route Tables" in the left-hand menu.
Add Route:
Select the route table associated with the VPC.
Click on the "Routes" tab and then click "Edit routes".
Click "Add route".
Enter the destination account's VPC CIDR block in the "Destination" field.
In the "Target" field, select "Peering Connection" and choose the peering connection ID.
Click "Save routes".
4. Update Security Groups in Source Account
Navigate to Security Groups: In the VPC dashboard of the source account, click on "Security Groups" in the left-hand menu.
Add Outbound Rule:
Select the relevant security group.
Click on the "Outbound rules" tab and then click "Edit outbound rules".
Click "Add rule".
Set the "Type" to "All traffic".
In the "Destination" field, select "Custom" and enter the security group ID of the destination account.
Click "Save rules".
5. Update Security Groups in Destination Account
Navigate to Security Groups: In the VPC dashboard of the destination account, click on "Security Groups" in the left-hand menu.
Add Inbound Rule:
Select the relevant security group.
Click on the "Inbound rules" tab and then click "Edit inbound rules".
Click "Add rule".
Set the "Type" to "All traffic" or specify the necessary port (e.g., "Custom TCP Rule" with port 27017 for MongoDB).
In the "Source" field, select "Custom" and enter the security group ID of the source account.
Click "Save rules".
Conclusion
By following these steps, you will have successfully established a VPC peering connection between the source and destination accounts. Ensure that the route tables and security group rules are correctly configured to allow the desired traffic between the VPCs.