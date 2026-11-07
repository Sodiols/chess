"use client";

import { useActionState } from "react";
import { submitContact, type ContactState } from "@/app/contact/actions";
import { errorMessage } from "@/lib/multiplayer/types";
import { Button } from "@/components/ui/Button";

const INITIAL: ContactState = { error: null, values: { name: "", email: "", message: "" } };

const FIELD =
  "w-full rounded-md border border-line bg-surface px-3.5 text-base sm:text-[0.9375rem] text-ink transition-[border-color,background-color] placeholder:text-faint hover:border-line-strong focus:border-accent focus:bg-raised focus:outline-none";

export function ContactForm() {
  const [state, action, pending] = useActionState(submitContact, INITIAL);
  // Keyed on the returned state so the inputs re-mount with what the visitor typed after React resets the form.
  const key = JSON.stringify(state.values);

  return (
    <form action={action} className="grid gap-5" key={key}>
      <div>
        <label htmlFor="contact-name" className="mb-2 block text-sm font-semibold">Name</label>
        <input id="contact-name" name="name" required maxLength={80} autoComplete="name" defaultValue={state.values.name} className={`${FIELD} h-12`} />
      </div>
      <div>
        <label htmlFor="contact-email" className="mb-2 block text-sm font-semibold">Email</label>
        <input
          id="contact-email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          defaultValue={state.values.email}
          className={`${FIELD} h-12`}
        />
      </div>
      <div>
        <label htmlFor="contact-message" className="mb-2 block text-sm font-semibold">Message</label>
        <textarea
          id="contact-message"
          name="message"
          required
          minLength={10}
          maxLength={4000}
          rows={6}
          defaultValue={state.values.message}
          className={`${FIELD} py-3`}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-[0.9375rem] text-[#f4aaa1]">
          {errorMessage(state.error)}
        </p>
      )}
      <div>
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? "Sending…" : "Send message"}
        </Button>
      </div>
    </form>
  );
}
