//var oracle_base = 'https://www.realitykeys.com'
var settings = {};
settings.oracle_base = 'https://www.realitykeys.com'
settings.oracle_base = 'http://beech.lab.socialminds.jp:8000';

settings.pubkey_record_store = 'contract/?cmd=store';
settings.pubkey_record_query = 'contract/?cmd=query';

settings.query_livenet = 'blockchain';
settings.pushtx_livenet = 'blockchain';
//settings.pushtx_livenet = 'none';
//pushtx_livenet = 'none';
//pushtx_livenet = 'blockchain';

// testnet always pushes to blockr.io

module.exports = settings;
