module.exports = {
  launch: {
    args: process.env.PUPPETEER_NO_SANDBOX ? ['--no-sandbox'] : [],
  },
  server: {
    command: 'serve -l 3000',
    port: 3000,
  },
}
