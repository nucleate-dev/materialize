import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Heading,
  Text,
  Button,
} from "@react-email/components";

export default function SubscriptionPaymentFailedEmail({
  name,
  planName,
  retryUrl = null,
}: {
  name: string;
  planName: string;
  retryUrl?: string | null;
}) {
  return (
    <Html>
      <Head />
      <Preview>
        Your subscription has been paused due to a failed payment
      </Preview>
      <Body style={mainStyle}>
        <Container style={containerStyle}>
          <Heading style={headingStyle}>Payment Failed</Heading>
          <Text style={paragraphStyle}>Hi {name},</Text>
          <Text style={paragraphStyle}>
            Unfortunately, we were unable to process your payment for the{" "}
            <strong>{planName}</strong> subscription. As a result, your
            subscription has been paused. Once your payment is completed, your
            subscription will automatically resume.
          </Text>
          {retryUrl ? (
            <>
              <Text style={paragraphStyle}>
                To continue using the service and reactivate your subscription,
                please retry your payment using the link below.
              </Text>
              <Button href={retryUrl} style={buttonStyle}>
                Retry Payment
              </Button>
            </>
          ) : null}
          <Text style={paragraphStyle}>
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
const mainStyle = {
  backgroundColor: "#f4f4f4",
  padding: "20px",
  fontFamily: "Arial, sans-serif",
};

const containerStyle = {
  backgroundColor: "#ffffff",
  padding: "20px",
  borderRadius: "8px",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
  maxWidth: "600px",
  margin: "0 auto",
};

const headingStyle = {
  color: "#333333",
  fontSize: "24px",
  fontWeight: "bold",
  marginBottom: "20px",
};

const paragraphStyle = {
  color: "#555555",
  fontSize: "16px",
  lineHeight: "1.5",
  marginBottom: "16px",
};

const buttonStyle = {
  backgroundColor: "#1a73e8",
  color: "#ffffff",
  textDecoration: "none",
  padding: "12px 24px",
  borderRadius: "5px",
  fontWeight: "bold",
  display: "inline-block",
  marginTop: "20px",
};
