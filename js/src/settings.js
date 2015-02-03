//var oracle_base = 'https://www.realitykeys.com'
var settings = {};
settings.oracle_base = 'http://54.250.98.53:8000';
//settings.oracle_base = 'http://beech.lab.socialminds.jp:8000';

settings.pubkey_record_store = 'api/contract/?cmd=store';
settings.pubkey_record_query = 'api/contract/?cmd=query';

settings.realitykeys_api = 'bounty';

settings.query_livenet = 'blockchain';
settings.pushtx_livenet = 'blockchain';
//settings.pushtx_livenet = 'none';
//pushtx_livenet = 'none';
//pushtx_livenet = 'blockchain';

// testnet always pushes to blockr.io

module.exports = settings;
