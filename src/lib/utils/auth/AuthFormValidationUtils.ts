/**
 * Validates if the given string is a properly formatted email address.
 *
 * The function uses a regular expression to ensure the input string follows
 * the standard email format (i.e., contains an "@" symbol, a domain, and a
 * valid top-level domain).
 *
 * The regex used checks for the following:
 * - No spaces in the email address.
 * - A single "@" symbol separating the local part and the domain.
 * - A valid domain name with a period followed by a top-level domain.
 *
 * @param {string} email - The email string to validate.
 * @returns {boolean} - Returns `true` if the email matches the valid format, otherwise `false`.
 *
 * @example
 * const validEmail = isValidEmailInput("user@example.com");
 * console.log(validEmail);  // Output: true
 *
 * const invalidEmail = isValidEmailInput("user@@example");
 * console.log(invalidEmail);  // Output: false
 */
export function isValidEmailInput(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Checks if a provided string is a valid US phone number.
 *
 * This function first removes all non-digit characters from the input string and
 * then checks if the resulting string has exactly 10 digits, which corresponds to
 * the standard length of a US phone number without the country code.
 *
 * @param {string} phoneNumber - The phone number string to validate.
 * @returns {boolean} - Returns `true` if the phone number is valid (exactly 10 digits),
 *                      otherwise returns `false`.
 *
 * @example
 * const validPhone = isValidUSPhoneNumber("123-456-7890");
 * console.log(validPhone);  // Output: true
 *
 * const invalidPhone = isValidUSPhoneNumber("+1 (123) 456-7890");
 * console.log(invalidPhone); // Output: false
 */
export function isValidUSPhoneNumber(phoneNumber: string): boolean {
  const cleanedPhoneNumber = phoneNumber.replace(/\D/g, "");
  return cleanedPhoneNumber.length === 10;
}

/**
 * Validates a given password based on specific security criteria.
 *
 * The function checks the password against the following rules:
 * - Must be at least 12 characters long.
 * - Must contain at least one lowercase letter.
 * - Must contain at least one uppercase letter.
 * - Must contain at least one digit.
 * - Must contain at least one symbol (non-alphanumeric character).
 *
 * If the password fails any of the above checks, the function returns a corresponding error message.
 * If the password meets all the criteria, the function returns `null`, indicating that the password is valid.
 *
 * @param {string} password - The password to be validated.
 * @returns {string | null} - Returns an error message string if the password is invalid, or `null` if the password is valid.
 *
 * @example
 * const result = isValidPassword("P@ssw0rd123");
 * if (result) {
 *   console.log(result);  // Output: "Password must be 12 characters long"
 * }
 *
 * const validResult = isValidPassword("StrongP@ssw0rd2024!");
 * if (!validResult) {
 *   console.log("Password is valid!");
 * }
 */
export function isValidPassword(password: string): string | null {
  if (password.length < 12) {
    return "Password must be 12 characters long";
  }
  // Check for at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    return "Password must have a lowercase letter";
  }
  // Check for at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    return "Password must have an uppercase letter";
  }
  // Check for at least one digit
  if (!/\d/.test(password)) {
    return "Password must have a digit";
  }
  // Check for at least one symbol (non-alphanumeric character)
  if (!/[!@#$%^&*()_+{}[\]:;<>,.?~\\-]/.test(password)) {
    return "Password must have a symbol: !@#$%^&*()_+{}[]:;<>,.?~_]";
  }
  return null;
}
