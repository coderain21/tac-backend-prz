module.exports = {
    env: {
        browser: true,
        commonjs: true,
        es2021: true,
    },
    extends: [
        'airbnb-base',
    ],
    parserOptions: {
        ecmaVersion: 'latest',
    },
    rules: {
        indent: ['error', 4],
        'max-len': ['error', { code: 320 }],
        // semi: [2, 'always', { omitLastInOneLineBlock: true }],
        semi: ['error', 'never'],
    },
}
