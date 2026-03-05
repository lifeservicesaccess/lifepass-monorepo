// over18.circom
// Predicate: Prove that a user’s age is at least 18 without revealing their exact birth year.
//
// This circuit takes a private `birth_year` and a public `current_year` and outputs a public
// boolean `is_over_18` indicating whether the age computed as (current_year ‑ birth_year) is
// greater than or equal to 18.  The circuit does not reveal the birth year itself.  When
// integrated into the LifePass flow, the prover should supply their birth year privately
// and the verifier will check the `is_over_18` signal.

pragma circom 2.1.6;
include "circomlib/circuits/comparators.circom";

template Over18() {
    // Private input: actual birth year of the user
    signal input birth_year;
    // Public input: current year (e.g., 2026)
    signal input current_year;
    // Public output: 1 if (current_year ‑ birth_year) ≥ 18, else 0
    signal output is_over_18;

    // Compute the user’s age
    signal age;
    age <== current_year - birth_year;

    // Use a comparator to test whether age < 18.  The LessThan template outputs 1 if
    // the first input is strictly less than the second.  We use 8 bits here since
    // typical ages (<150) comfortably fit within 8 bits.  If the age ever exceeds
    // 255, increase the bit width accordingly.
    component less = LessThan(8);
    less.in[0] <== age;
    less.in[1] <== 18;

    // If age < 18 then less.out = 1 and the user is not over 18.  Otherwise, age ≥ 18
    // and less.out = 0.  Subtract from 1 to obtain our boolean predicate.
    is_over_18 <== 1 - less.out;
}

component main = Over18();
