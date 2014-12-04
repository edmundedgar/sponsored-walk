/*
This script populates the page for a contract based on an ID paramter in the URL.
Once the page is populated so it knows what contract it should represeet, it calls
initialize_page()

If you prefer to generate the index.html page dynamically you can populate the form on the server-side.
In that case you can delete everything here except the call to 
initialize_page()
*/

function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
    results = regex.exec(location.search);
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

$(function() {
    var site_resource_id = parseInt(getParameterByName('id'));
    if (!site_resource_id) {
        // If there's no site_resource_id we'll need the user to fill in the form.
        // This makes the form a standard feature which should never be hidden, not an advanced one.
        $('#create-reality-key-form').closest('div').removeClass('advanced');
        return;
    }

    $('#site-resource-id').val(site_resource_id);

    var url = 'api/resources/?id=' + site_resource_id;
    $.ajax({
        url: url,
        type: 'GET',
        dataType: 'json'
    }).done( function(data) {
        // NB Only the title will exist on the claim page. 
        // That's OK, jquery doesn't mind applying things to zero elements.
        $('#title').text(data['title']); 
        $('#user_id').val(data['user_id']); 
        $('#activity').val(data['activity']); 
        $('#measurement').val(data['measurement']); 
        $('#goal').val(data['goal']); 
        $('#settlement_date').val(data['settlement_date']); 
        //$('#setting_default_days_in_future').val(data['setting_default_days_in_future']);
        $('#counterparty-pub-key').val(data['sponsored_pubkey']);
        $('#objection_period_secs').val(data['objection_period_secs']);
        main.initialize_page();
    }).fail( function(data) {
        alert('Could not fetch information about this from the site. Please try again later.');
        return;
    });
});
