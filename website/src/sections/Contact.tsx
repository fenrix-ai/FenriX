import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, AlertCircle, Send } from 'lucide-react'
import { submitContact } from '../lib/submit-contact'

const Schema = z.object({
  name: z.string().min(1, 'Required').max(120),
  email: z.string().email('Invalid email').max(200),
  org: z.string().max(200).optional(),
  topic: z.enum(['partnership', 'sponsorship', 'press', 'joining', 'other']),
  message: z.string().min(10, 'Tell us a little more').max(4000),
  _honeypot: z.string().optional()
})
type FormValues = z.infer<typeof Schema>

export function Contact() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { topic: 'partnership' }
  })
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle')

  const onSubmit = async (values: FormValues) => {
    try {
      await submitContact(values)
      setStatus('ok')
    } catch (err) {
      console.error(err)
      setStatus('error')
    }
  }

  if (status === 'ok') {
    return (
      <section id="contact" className="container-page py-24 md:py-32">
        <div className="max-w-xl mx-auto text-center">
          <CheckCircle2 size={48} className="mx-auto text-success" />
          <h2 className="mt-6 font-display font-bold text-3xl md:text-4xl">Message received.</h2>
          <p className="mt-3 text-ink-dim">We'll be in touch within 5 business days.</p>
        </div>
      </section>
    )
  }

  return (
    <section id="contact" className="container-page py-24 md:py-32" aria-labelledby="contact-title">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <div className="font-mono text-[10px] tracking-widest uppercase text-cyan-soft mb-3">Contact</div>
          <h2 id="contact-title" className="font-display font-bold text-3xl md:text-5xl tracking-tightish">
            Want to play, partner, or join?
          </h2>
          <p className="mt-3 text-ink-dim">Drop us a note — we read everything.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            {...register('_honeypot')}
            className="hidden"
            aria-hidden="true"
          />

          <Field label="Name" error={errors.name?.message}>
            <input {...register('name')} className={inputCls} autoComplete="name" />
          </Field>
          <Field label="Email" error={errors.email?.message}>
            <input type="email" {...register('email')} className={inputCls} autoComplete="email" />
          </Field>
          <Field label="Organization or school (optional)" error={errors.org?.message}>
            <input {...register('org')} className={inputCls} autoComplete="organization" />
          </Field>
          <Field label="Topic" error={errors.topic?.message}>
            <select {...register('topic')} className={inputCls}>
              <option value="partnership">Partnership</option>
              <option value="sponsorship">Sponsorship</option>
              <option value="press">Press</option>
              <option value="joining">Joining FenriX</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Message" error={errors.message?.message}>
            <textarea rows={5} {...register('message')} className={`${inputCls} resize-y min-h-[120px]`} />
          </Field>

          {status === 'error' && (
            <div className="flex items-start gap-2 text-coral text-sm">
              <AlertCircle size={16} className="mt-0.5" />
              Something broke. Please try again in a moment.
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-cyan text-bg font-medium hover:bg-cyan-soft disabled:opacity-50 transition-colors"
          >
            <Send size={16} />
            {isSubmitting ? 'Sending…' : 'Send message'}
          </button>
        </form>

        <p className="mt-12 text-center text-sm text-ink-dim">
          Want to join FenriX as a student?{' '}
          <a
            href="https://github.com/fenrix-ai"
            target="_blank"
            rel="noreferrer"
            className="text-cyan hover:text-cyan-soft underline-offset-4 hover:underline"
          >
            See us on GitHub →
          </a>
        </p>
      </div>
    </section>
  )
}

const inputCls =
  'w-full px-4 py-3 rounded-md bg-surface border border-white/10 text-ink placeholder:text-ink-dim/60 focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/30 transition-colors'

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-ink-dim mb-1.5">{label}</span>
      {children}
      {error && <span role="alert" className="mt-1 block text-xs text-coral">{error}</span>}
    </label>
  )
}
