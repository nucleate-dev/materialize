import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Heading,
  Text,
} from "@react-email/components";

export default function TrialEndingEmail({
  name,
  planName,
}: {
  name: string;
  planName: string;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Your free trial is ending soon</Preview>{" "}
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Free Trial Ending Soon</Heading>
          <Text style={paragraph}>Hi {name},</Text>
          <Text style={paragraph}>
            We wanted to let you know that your free trial for the{" "}
            <strong>{planName}</strong> plan will be ending in 3 days.
          </Text>
          <Text style={paragraph}>
            No action needs to be taken to continue enjoying uninterrupted
            access to all features. To manage your subscription, log into your
            account.
          </Text>
          <Text style={paragraph}>
            Best regards,
            <br />
            The YourApp Team
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// Styles for the email components
const main = {
  backgroundColor: "#f6f9fc",
  padding: "20px",
  fontFamily: "Arial, sans-serif",
};

const container = {
  backgroundColor: "#ffffff",
  padding: "20px",
  borderRadius: "8px",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
};

const heading = {
  color: "#333333",
  fontSize: "24px",
  fontWeight: "bold",
  marginBottom: "20px",
};

const paragraph = {
  color: "#555555",
  fontSize: "16px",
  lineHeight: "1.5",
  marginBottom: "16px",
};
