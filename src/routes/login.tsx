import { createFileRoute } from '@tanstack/react-router'
import { AuthPage } from '../components/AuthPage'

export const Route = createFileRoute('/login')({
  head: () => ({
    meta: [
      { title: 'Login — W.A.G.E. Society' },
      {
        name: 'description',
        content: 'Log in to your W.A.G.E. Society account.',
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: LoginPage,
})

function LoginPage() {
  return <AuthPage view="login" />
}