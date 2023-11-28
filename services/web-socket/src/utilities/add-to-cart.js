const mongodbHelper = require('./mongodb_helper')

module.exports.addToCart = async (record) => {
    try {
        const save = await mongodbHelper.lotToCart(record)
        return {
            success: true,
        }
    } catch (err) {
        return err
    }
}
