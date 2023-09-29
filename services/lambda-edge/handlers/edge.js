/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
// eslint-disable-next-line import/no-unresolved
// const getDomainList = require('../data/s3_query')
const mongoConnection = require('../mongodb_helper')

module.exports.handler = async (event, context, callback) => {
    // Get contents of response
    console.log('event', JSON.stringify(event))
    const response = event.Records[0].cf.request
    console.log('response', JSON.stringify(response))
    console.log('event.Records[0].cfevent.Records[0].cf', JSON.stringify(event.Records[0].cf))
    // response.headers = {}
    const { headers } = response
    const domain_data = await mongoConnection.subdomain('indyauction-develop', 'dev-subdomain', { subdomain: 'sthuthi' })
    console.log(domain_data, 'asdfghj')
    console.log('headers.host[0]', JSON.stringify(headers.host[0]))
    const host = headers.host[0].value.split('.')[0]
    // const domainList = await getDomainList.getDomainList({ search: host })
    // console.log('hosthosthosthost', host)
    // console.log('domainListdomainListdomainListdomainList', domainList)
    if (!domain_data && host === domain_data?.subdomain) {
        callback(null, response)
    } else {
        const content = `
            <!DOCTYPE html>
            <html lang="en">
              <head>
                <meta charset="utf-8">
                <title>EasyIdGen5%</title>
              </head>
              <body>
                <p>Domain Not found</p>
              </body>
            </html>
            `
        const rresponse = {
            status: '200',
            statusDescription: 'OK',
            headers: {
                'cache-control': [{
                    key: 'Cache-Control',
                    value: 'max-age=100',
                }],
                'content-type': [{
                    key: 'Content-Type',
                    value: 'text/html',
                }],
            },
            body: content,
        }
        callback(null, rresponse)
    }
}
