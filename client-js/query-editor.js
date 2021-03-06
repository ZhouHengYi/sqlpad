var $ = require('jquery');
var keymaster = require('keymaster');
var ChartEditor = require('./component-chart-editor.js');
var DbInfo = require('./component-db-info.js');
var AceSqlEditor = require('./component-ace-sql-editor.js');
var DataGrid = require('./component-data-grid.js');

var QueryEditor = function () {
    
    var chartEditor = new ChartEditor();
    var dbInfo = new DbInfo();
    var aceSqlEditor = new AceSqlEditor("ace-editor");
    var dataGrid = new DataGrid();
    var chartFormat = $('[format="chart"]').length > 0;
    var tableFormat = $('[format="table"]').length > 0;
    
    function autoRefreshSeconds () {
        return $('#auto-refresh-seconds').val();
    }
    
    function autoRefreshEnabled () {
        return $('#enable-auto-refresh').prop("checked");
    }
    
    function runQuery () {
        $('#server-run-time').html('');
        $('#rowcount').html('');
        dataGrid.emptyDataGrid();
        var data = {
            queryText: aceSqlEditor.getSelectedOrAllText(),
            connectionId: $('#connection').val(),
            cacheKey: $('#cache-key').val(),
            queryName: getQueryName()
        };
        dataGrid.startRunningTimer();
        $.ajax({
            type: "POST",
            url: baseUrl + "/run-query",
            data: data
        }).done(function (data) {
            // if refresh is turned on run the query again!
            if (!autoRefreshSeconds()) {
                console.log("no seconds specified. turning autofresh off");
                $('#enable-auto-refresh').prop("checked", false);
            }
            if (autoRefreshEnabled() && autoRefreshSeconds()) {
                setTimeout(function () {
                    if (autoRefreshEnabled()) {
                        runQuery();
                    }
                }, autoRefreshSeconds() * 1000);
            }

            chartEditor.setData(data);

            dataGrid.stopRunningTimer();
            $('#server-run-time').html(data.serverMs/1000 + " sec.");
            if (data.success) {
                $('.hide-while-running').show();
                if (data.incomplete) {
                    $('.incomplete-notification').removeClass("hidden");
                } else {
                    $('.incomplete-notification').addClass("hidden");
                }
                dataGrid.renderGridData(data);

                if ($('#tab-content-visualize.active').length) {
                    chartEditor.rerenderChart();
                }

            } else {
                dataGrid.renderError(data.error);
            }
        }).fail(function () {
            dataGrid.stopRunningTimer();
            dataGrid.renderError("Something is broken :(");
        });
    }
    
    function getQueryName () {
        return $('#header-query-name').val();
    }
    
    function getQueryTags () {
        return $.map($('#tags').val().split(','), $.trim);
    }
    
    function saveQuery () {
        var $queryId = $('#query-id');
        var query = {
            name: getQueryName(),
            queryText: aceSqlEditor.getEditorText(),
            tags: getQueryTags(),
            connectionId: dbInfo.getConnectionId(),
            chartConfiguration: chartEditor.getChartConfiguration()
        };
        $('#btn-save-result').text('saving...').show();
        $.ajax({
            type: "POST",
            url: baseUrl + "/queries/" + $queryId.val(),
            data: query
        }).done(function (data) {
            if (data.success) {
                window.history.replaceState({}, "query " + data.query._id, baseUrl + "/queries/" + data.query._id);
                $queryId.val(data.query._id);
                $('#btn-save-result').removeClass('label-info').addClass('label-success').text('Success');
                setTimeout(function () {
                    $('#btn-save-result').fadeOut(400, function () {
                        $('#btn-save-result').removeClass('label-success').addClass('label-info').text('');
                    });
                }, 1000);
            } else {
                $('#btn-save-result').removeClass('label-info').addClass('label-danger').text('Failed');
            }
        }).fail(function () {
            alert('ajax fail');
        });
    }
    
    $('#btn-save').click(function (event) {
        event.preventDefault();
        event.stopPropagation();
        saveQuery();
    });
    
    $('#btn-run-query').click(function (event) {
        event.preventDefault();
        event.stopPropagation();
        runQuery();
    });

    $('#btn-link-to-table').click(function (event) {
        event.preventDefault();
        event.stopPropagation();
        window.open('?format=table', '_queryPreview');
    });
    
    /*  (re-)render the chart when the viz tab is pressed, 
        TODO: only do this if necessary
    ==============================================================================*/
    $('a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
        // if shown tab was the chart tab, rerender the chart
        // e.target is the activated tab
        if (e.target.getAttribute("href") == "#tab-content-visualize") {
            chartEditor.rerenderChart();
        } else if (e.target.getAttribute("href") == "#tab-content-sql") {
            dataGrid.resize();
        }
    });
    
    /*  get query again, because not all the data is in the HTML
        TODO: do most the workflow this way? 
    ==============================================================================*/
    var $queryId = $('#query-id');
    $.ajax({
        type: "GET",
        url: baseUrl + "/queries/" + $queryId.val() + "?format=json"
    }).done(function (data) {
        chartEditor.loadChartConfiguration(data.chartConfiguration);

        // if showing an embeddable chart, run the query immediately
        if (chartFormat || tableFormat) {
            runQuery();
        }
    }).fail(function () {
        alert('Failed to get additional Query info');
    });
    
    /*  Tags Typeahead
    ==============================================================================*/
    var Bloodhound = require('Bloodhound');
    var bloodhoundTags = new Bloodhound({
      datumTokenizer: Bloodhound.tokenizers.obj.whitespace('name'),
      queryTokenizer: Bloodhound.tokenizers.whitespace,
      prefetch: {
        url: baseUrl + '/tags', // array of tagnames
        ttl: 0,
        filter: function(list) {
          return $.map(list, function(tag) {
            return { name: tag }; });
        }
      }
    });
    bloodhoundTags.initialize();
    $('#tags').tagsinput({
      typeaheadjs: {
        //name: 'tags',
        displayKey: 'name',
        valueKey: 'name',
        source: bloodhoundTags.ttAdapter()
      }
    });
    
    /*  Shortcuts
    ==============================================================================*/
    // keymaster doesn't fire on input/textarea events by default
    // since we are only using command/ctrl shortcuts, 
    // we want the event to fire all the time for any element
    keymaster.filter = function (event) {
        return true; 
    };
    keymaster('ctrl+s, command+s', function() { 
        saveQuery();
        return false;
    });
    keymaster('ctrl+r, command+r, ctrl+e, command+e', function() { 
        runQuery();
        return false;
    });

    if (chartFormat) {
        //$('.navbar').hide();
        $('[href="#tab-content-visualize"]').tab('show');
        // $('.sidebar').hide();
        // $('#panel-main').addClass('fullscreen');
    }

};


module.exports = function () {
    if ($('#ace-editor').length || $('#panel-main[format="chart"]').length) {
        new QueryEditor();
    }
};
