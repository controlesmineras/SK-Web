// These module-level tests supply an authenticated operator. Expiry is exercised in offline-session-policy.
const policy={check:()=>true,allows:()=>true,notice:()=>'',requireActive(){},signedIn(){},synced(){}};
module.exports={policy,entry:{sessionPolicy:()=>policy,rejected:()=>false}};
