//var oracle_base = 'https://www.realitykeys.com'
var settings = {};
settings.oracle_base = 'https://www.realitykeys.com'
//settings.oracle_base = 'http://beech.lab.socialminds.jp:8000';

settings.realitykeys_api = 'runkeeper';

settings.pubkey_record_store = 'api/contract/?cmd=store';
settings.pubkey_record_query = 'api/contract/?cmd=query';

settings.query_livenet = 'blockchain';
settings.pushtx_livenet = 'blockchain';
//settings.pushtx_livenet = 'none';
//pushtx_livenet = 'none';
//pushtx_livenet = 'blockchain';

// testnet always pushes to blockr.io

module.exports = settings;
