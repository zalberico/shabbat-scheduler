import {
  Html, Head, Body, Container, Section, Text, Link, Hr, Preview,
} from '@react-email/components'
import * as React from 'react'

const styles = {
  body: { backgroundColor: '#f5f0e8', fontFamily: 'Inter, sans-serif' },
  container: { margin: '0 auto', padding: '20px', maxWidth: '560px' },
  card: { backgroundColor: '#ffffff', borderRadius: '12px', padding: '32px', border: '1px solid #e8dcc8' },
  h1: { color: '#1e3a5f', fontSize: '24px', fontWeight: 'bold' as const, margin: '0 0 16px' },
  text: { color: '#374151', fontSize: '16px', lineHeight: '24px', margin: '0 0 12px' },
  small: { color: '#6b7280', fontSize: '14px', lineHeight: '20px' },
  button: {
    backgroundColor: '#1e3a5f', color: '#ffffff', padding: '12px 24px',
    borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' as const,
    display: 'inline-block' as const,
  },
  footer: { color: '#9ca3af', fontSize: '12px', textAlign: 'center' as const, marginTop: '24px' },
}

export function HostMatchEmail({
  hostName, weekOf, guests,
}: {
  hostName: string
  weekOf: string
  guests: { name: string; partySize: number; dietary: string[] }[]
}) {
  const totalGuests = guests.reduce((sum, g) => sum + g.partySize, 0)
  return (
    <Html>
      <Head />
      <Preview>{`You're hosting ${totalGuests} guests this Friday!`}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.card}>
            <Text style={styles.h1}>Shabbat Shalom, {hostName}!</Text>
            <Text style={styles.text}>
              You&apos;re hosting dinner this Friday ({weekOf}). Here are your guests:
            </Text>
            {guests.map((g, i) => (
              <Text key={i} style={styles.text}>
                • <strong>{g.name}</strong> (party of {g.partySize})
                {g.dietary.length > 0 && ` — Dietary: ${g.dietary.join(', ')}`}
              </Text>
            ))}
            <Hr />
            <Text style={styles.small}>
              Please reply to your guests&apos; introduction emails with your address and any details.
              Total guests: {totalGuests}
            </Text>
          </Section>
          <Text style={styles.footer}>
            Noe Valley Chavurah Shabbat Dinner Program
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export function GuestMatchEmail({
  guestName, hostName, startTime, kashrut, observance, kidsFriendly, dogsFriendly, weekOf,
}: {
  guestName: string
  hostName: string
  startTime: string
  kashrut: string
  observance?: string
  kidsFriendly?: boolean
  dogsFriendly?: boolean
  weekOf: string
}) {
  return (
    <Html>
      <Head />
      <Preview>You&apos;re having Shabbat dinner at {hostName}&apos;s!</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.card}>
            <Text style={styles.h1}>Shabbat Shalom, {guestName}!</Text>
            <Text style={styles.text}>
              You&apos;re having dinner this Friday ({weekOf}) at <strong>{hostName}&apos;s</strong> home.
            </Text>
            <Text style={styles.text}>
              Start time: <strong>{startTime === 'candle_lighting' ? 'Candle lighting' : startTime}</strong>
            </Text>
            <Text style={styles.text}>
              Kashrut: <strong>{kashrut}</strong>
            </Text>
            {observance && (
              <Text style={styles.text}>
                Observance: <strong>{observance}</strong>
              </Text>
            )}
            {kidsFriendly && (
              <Text style={styles.text}>Kids welcome</Text>
            )}
            {dogsFriendly && (
              <Text style={styles.text}>Dogs present in household</Text>
            )}
            <Hr />
            <Text style={styles.small}>
              Your host will reply with their address. Have a wonderful Shabbat!
            </Text>
          </Section>
          <Text style={styles.footer}>
            Noe Valley Chavurah Shabbat Dinner Program
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export function UnmatchedEmail({
  name, weekOf,
}: {
  name: string
  weekOf: string
}) {
  return (
    <Html>
      <Head />
      <Preview>No match this week — try again next Friday!</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.card}>
            <Text style={styles.h1}>Hi {name},</Text>
            <Text style={styles.text}>
              Unfortunately, we weren&apos;t able to find a match for you this Friday ({weekOf}).
              This can happen when there aren&apos;t enough hosts or when specific requirements
              limit compatibility.
            </Text>
            <Text style={styles.text}>
              Please try again next week — we&apos;d love to have you at a Shabbat dinner!
            </Text>
          </Section>
          <Text style={styles.footer}>
            Noe Valley Chavurah Shabbat Dinner Program
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export function ReminderEmail({
  name, appUrl,
}: {
  name: string
  appUrl: string
}) {
  return (
    <Html>
      <Head />
      <Preview>Sign up for Shabbat dinner this Friday!</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.card}>
            <Text style={styles.h1}>Shabbat is coming, {name}!</Text>
            <Text style={styles.text}>
              Don&apos;t forget to sign up for this Friday&apos;s Shabbat dinner.
              Whether you want to host or join as a guest, sign up by Wednesday night.
            </Text>
            <Link href={appUrl} style={styles.button}>
              Sign up now
            </Link>
          </Section>
          <Text style={styles.footer}>
            Noe Valley Chavurah Shabbat Dinner Program
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
