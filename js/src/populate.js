function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
    results = regex.exec(location.search);
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

$(function() {
    var site_resource_id = parseInt(getParameterByName('id'));
    if (!site_resource_id) {
        $('#create-reality-key-form').closest('div').removeClass('advanced');
        return;
    }

    if ($('body').hasClass('claim-page')) {
        $('#site-resource-id').val(site_resource_id);
        index.initialize_page();
        return;
    }

    var url = 'resources/?id=' + site_resource_id;
    $.ajax({
        url: url,
        type: 'GET',
        dataType: 'json'
    }).done( function(data) {
        $('#user_id').val(data['user_id']); 
        $('#activity').val(data['activity']); 
        $('#measurement').val(data['measurement']); 
        $('#goal').val(data['goal']); 
        $('#settlement_date').val(data['settlement_date']); 
        $('#setting_default_days_in_future').val(data['setting_default_days_in_future']);
        $('#site-resource-id').val(site_resource_id);
        index.initialize_page();
    }).fail( function(data) {
        alert('Could not fetch information about this from the site. Please try again later.');
        return;
    });
});
