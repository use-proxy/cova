import { Button, Text } from "@react-email/components";
import { EmailLayout, styles } from "./_shared";

interface ForgotPasswordEmailProps {
  resetUrl: string;
}

export function ForgotPasswordEmail({ resetUrl }: ForgotPasswordEmailProps) {
  return (
    <EmailLayout
      preview="Reset your Cova password"
      headline="Reset your password."
    >
      <Text style={styles.text}>
        We received a request to reset the password for your Cova account.
      </Text>
      <Button href={resetUrl} style={styles.cta}>
        RESET PASSWORD
      </Button>
      <Text style={styles.text}>
        If the button doesn't work, paste this link into your browser:
      </Text>
      <Text style={styles.fallbackLink}>{resetUrl}</Text>
      <Text style={styles.footer}>
        This link expires in 1 hour. If you didn't request this, you can ignore this email.
      </Text>
    </EmailLayout>
  );
}

export default ForgotPasswordEmail;
