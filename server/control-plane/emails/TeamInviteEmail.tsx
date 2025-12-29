import React from 'react';
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Heading,
  Text,
  Button,
  Hr,
} from '@react-email/components';

interface TeamInviteEmailProps {
  inviterName: string;
  teamName: string;
  inviteUrl: string;
}

export default function TeamInviteEmail({
  inviterName,
  teamName,
  inviteUrl,
}: TeamInviteEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>You have been invited to a team in Nucleate!</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brandText}>Nucleate</Text>
          <Heading style={heading}>
            You have been invited to a team in Nucleate!
          </Heading>
          <Text style={paragraph}>
            {inviterName} has invited you to collaborate in Nucleate. Click this
            link to join {teamName}.
          </Text>
          <div style={buttonContainer}>
            <Button style={button} href={inviteUrl}>
              Join Team
            </Button>
          </div>
          <Hr style={divider} />
          <Text style={footerText}>
            If you didn't expect this invitation, you can safely ignore this
            email.
          </Text>
          <Text style={copyright}>© 2025 Nucleate</Text>
        </Container>
        <Text style={tagline}>Powering next-gen builders</Text>
      </Body>
    </Html>
  );
}

// Styles for the email components
const main = {
  backgroundColor: '#0a0a0a',
  padding: '40px 20px',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const container = {
  backgroundColor: '#1a1a1a',
  border: '1px solid #2a2a2a',
  padding: '48px',
  borderRadius: '8px',
  maxWidth: '600px',
  margin: '0 auto',
};

const brandText = {
  color: '#ffffff',
  fontSize: '20px',
  fontWeight: '700',
  marginBottom: '32px',
  marginTop: '0',
};

const heading = {
  color: '#ffffff',
  fontSize: '32px',
  fontWeight: '700',
  lineHeight: '1.2',
  marginBottom: '24px',
  marginTop: '0',
};

const paragraph = {
  color: '#a0a0a0',
  fontSize: '16px',
  lineHeight: '1.6',
  marginBottom: '32px',
  marginTop: '0',
};

const buttonContainer = {
  marginBottom: '32px',
};

const button = {
  backgroundColor: '#6366f1',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  borderRadius: '8px',
  padding: '14px 32px',
  textDecoration: 'none',
  display: 'inline-block',
};

const divider = {
  borderColor: '#2a2a2a',
  marginTop: '32px',
  marginBottom: '32px',
};

const footerText = {
  color: '#666666',
  fontSize: '14px',
  lineHeight: '1.5',
  marginBottom: '16px',
  marginTop: '0',
};

const copyright = {
  color: '#666666',
  fontSize: '14px',
  marginTop: '0',
  marginBottom: '0',
};

const tagline = {
  color: '#666666',
  fontSize: '14px',
  textAlign: 'center' as const,
  marginTop: '24px',
};
