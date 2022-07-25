export interface Feeds {
  opml: OPML
}

export interface OPML {
  version: string
  head: Head
  body: Body
}

export interface Body {
  subs: Sub[]
}

export interface Sub {
  text: string
  title: string
  subs?: Sub[]
  description?: string
  type?: Type
  version?: Version
  htmlUrl?: string
  xmlUrl?: string
}

export enum Type {
  RSS = 'rss',
}

export enum Version {
  RSS = 'RSS',
}

export interface Head {
  title: string
  generator: string
}
