/**
 * /login → redirects to /register (which handles both login + registration)
 */
import { redirect } from 'next/navigation'

export default function LoginPage() {
  redirect('/register')
}
