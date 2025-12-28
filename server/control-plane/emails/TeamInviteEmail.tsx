import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Heading,
  Text,
  Button,
  Img,
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
          <div style={logoContainer}>
            <Img
              src="https://nucleate.dev/logo.png"
              alt="Nucleate Logo"
              width="60"
              height="60"
              style={logo}
            />
          </div>
          <Heading style={heading}>
            You have been invited to a team in Nucleate!
          </Heading>
          <Text style={paragraph}>
            {inviterName} has invited you to collaboratein Nucleate. Click this
            link to join {teamName}.
          </Text>
          <div style={buttonContainer}>
            <Button style={button} href={inviteUrl}>
              Join Team
            </Button>
          </div>
        </Container>
      </Body>
    </Html>
  );
}

// Styles for the email components
const main = {
  backgroundColor: '#f6f9fc',
  padding: '40px 20px',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  padding: '40px',
  borderRadius: '8px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
  maxWidth: '560px',
  margin: '0 auto',
};

const logoContainer = {
  textAlign: 'center' as const,
  marginBottom: '32px',
};

const logo = {
  borderRadius: '12px',
};

const heading = {
  color: '#1a1a1a',
  fontSize: '28px',
  fontWeight: '700',
  lineHeight: '1.3',
  marginBottom: '24px',
  textAlign: 'center' as const,
};

const paragraph = {
  color: '#525252',
  fontSize: '16px',
  lineHeight: '1.6',
  marginBottom: '32px',
  textAlign: 'center' as const,
};

const buttonContainer = {
  textAlign: 'center' as const,
  marginTop: '32px',
};

const button = {
  backgroundColor: '#000000',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  borderRadius: '6px',
  padding: '12px 32px',
  textDecoration: 'none',
  display: 'inline-block',
};
