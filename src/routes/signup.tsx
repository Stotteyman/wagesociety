import { createFileRoute } from '@tanstack/react-router'
import { AuthPage } from '../components/AuthPage'

export const Route = createFileRoute('/signup')({
  head: () => ({
    meta: [
      { title: 'Sign Up — W.A.G.E. Society' },
      {
        name: 'description',
        content: 'Create your W.A.G.E. Society membership account.',
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: SignupPage,
})

function SignupPage() {
  return <AuthPage view="signup" />
}