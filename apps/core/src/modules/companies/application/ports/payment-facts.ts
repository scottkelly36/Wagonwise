/** What the payments module tells companies about a company's payment details. Supplied by composition; absent means none are on file. */
export interface PaymentFacts {
  hasPaymentMethod(companyId: string): Promise<boolean>;
}
