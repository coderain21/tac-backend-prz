module.exports.handler = async (event) => {
    try {
        console.log('event', event)
    } catch (err) {
        console.log('error', err)
    }
}
