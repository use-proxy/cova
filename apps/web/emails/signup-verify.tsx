import { Button, Text } from "@react-email/components";
import { EmailLayout, styles } from "./_shared";

interface SignupVerifyEmailProps {
  verifyUrl: string;
}

export function SignupVerifyEmail({ verifyUrl }: SignupVerifyEmailProps) {
  return (
    <EmailLayout
      preview="Verify your Cova account"
      headline="Welcome to Cova."
    >
      <Text style={styles.text}>
        Confirm your email to start designing your space.
      </Text>
      <Button href={verifyUrl} style={styles.cta}>
        VERIFY EMAIL
      </Button>
      <Text style={styles.text}>
        If the button doesn't work, paste this link into your browser:
      </Text>
      <Text style={styles.fallbackLink}>{verifyUrl}</Text>
      <Text style={styles.footer}>
        This link expires in 24 hours.
      </Text>
    </EmailLayout>
  );
}

export default SignupVerifyEmail;
