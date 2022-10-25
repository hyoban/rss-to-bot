import type { Item } from 'rss-parser'

export function isFeedNeedToBeSent(item: Item) {
  // ignore some types of github notifications
  if (
    item.link?.includes('https://github.com/')
    && [
      'deleted branch',
      'pushed to',
      'created a branch',
      'closed an issue',
      'closed a pull request',
      'created a tag',
      'deleted tag',
    ].some(i => item.title?.includes(i))
  ) {
    return false
  }

  // ignore easy's weibo
  if (
    /「GitHub多星项目 ✨」.+/.test(item.title!)
    || /每天一个Linux上会用到的命令：今天是.+你用过吗/.test(item.title!)
  ) {
    return false
  }

  if (item.title?.includes('拼多多')) {
    return false
  }

  return true
}
