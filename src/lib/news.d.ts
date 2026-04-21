export type NewsPost = {
  id: string
  title: string
  body: string
  created_at: string
  author: string
  image_url?: string
  video_url?: string
}

export type NewsPostInput = {
  title: string
  body: string
  image_url?: string
  video_url?: string
}
