# CRM contact and POS account mapping

One CRM contact may link to multiple POS accounts, each with its own phone number. A POS account may link to only one CRM contact within an organization.

`contact_pos_links` stores these links and enforces one owner per POS account. `contacts.pos_customer_id` remains the primary POS account used by older screens. Adding another POS account must preserve the primary link; removing the primary promotes another linked account.
