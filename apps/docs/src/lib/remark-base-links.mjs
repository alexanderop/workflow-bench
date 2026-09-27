// Keep authoring links rooted at the docs site, including MDX LinkCard props.
export function remarkBaseLinks({ base = '/' } = {}) {
  const prefix = base.replace(/\/$/, '')
  const withBase = (url) =>
    url.startsWith('/') && !url.startsWith('//') ? `${prefix}${url}` : url
  return (tree) => {
    function visit(node) {
      if (typeof node.url === 'string') node.url = withBase(node.url)
      for (const attribute of node.attributes ?? []) {
        if (attribute.name === 'href' && typeof attribute.value === 'string')
          attribute.value = withBase(attribute.value)
      }
      for (const child of node.children ?? []) visit(child)
    }
    visit(tree)
  }
}
