# migration
Resources for porting database applications to 4D

## Microsoft Access

Microsoft Access is a database management system developed by Microsoft that combines the relational Microsoft Jet Database Engine with a graphical user interface and software-development tools, allowing users to build databases without needing extensive programming knowledge.

### Plan 

- port [4d-plugin-mdb](https://github.com/miyako/4d-plugin-mdb) to **rust** with [**jetdb**](https://docs.rs/jetdb/latest/jetdb/) crate
- convert .mdb to .4dcatalog in one shot
- generate example ORDA test code
