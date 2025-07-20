import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Heading,
  Text,
  Link,
  Button,
} from "@react-email/components";

export default function OneTimePaymentConfirmationEmail({
  name,
  products,
  receiptUrl,
}: {
  name: string;
  products: Array<string>;
  receiptUrl: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>Thank you for your purchase!</Preview>{" "}
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Thank You for Your Purchase!</Heading>
          <Text style={paragraph}>Hi {name},</Text>
          <Text style={paragraph}>
            Thank you for purchasing from us! We truly appreciate your business
            and hope you enjoy your products. If you have any questions or
            concerns about your purchase, feel free to{" "}
            <Link href={`${process.env.NEXT_PUBLIC_SITE_BASE_URL}/contact`}>
              contact us
            </Link>
            .
          </Text>

          <Text style={paragraph}>Here’s a summary of what you purchased:</Text>

          <ul style={productList}>
            {products.map((product, index) => (
              <li key={index} style={productItem}>
                {product}
              </li>
            ))}
          </ul>

          <Text style={paragraph}>
            You can view and download your receipt at any time by visiting the
            link below:
          </Text>
          <Button style={button} href={receiptUrl}>
            View Your Receipt
          </Button>

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

const button = {
  backgroundColor: "#1a73e8",
  color: "#ffffff",
  textDecoration: "none",
  padding: "12px 24px",
  borderRadius: "5px",
  fontWeight: "bold",
  display: "inline-block",
};

const productList = {
  listStyleType: "none",
  paddingLeft: 0,
  marginBottom: "20px",
};

const productItem = {
  fontSize: "16px",
  color: "#333",
  marginBottom: "8px",
};
