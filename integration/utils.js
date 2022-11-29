window.mapActions = (item) => ({
  ...item,
  el: (item.el.tagName.toLowerCase() + '.' + item.el.className).replace(
    /\.$/,
    ''
  ),
})
