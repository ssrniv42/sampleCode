<?php
//Track24 2013
//Author : Steven R Crawford / Martin Pearman
//Co-Author : Masoud Omran - Jing Guan
//Get Asset GPS INFO

session_start(); include $_SESSION['SYSCON_URL'];
    
	/*Gets the current client id.*/
	$owner = $_SESSION['SESS_CLIENT_ID'];
	
	$date = new DateTime();
	$now = $date->getTimestamp();
	
	/*  get all assets from the last 24 hour period. */
	if($_SESSION['SAVEDSTATS_REPORTAGE'] == -1){
		$last_timestamp= 0;
	}else{
		$last_timestamp=time()-($_SESSION['SAVEDSTATS_REPORTAGE']*60*60);
	}
		
	//  Gets the information of all assets reported within the last 24 hour for the current client.
	$queryDataGet ="SELECT *, ($now - gpsRecent.set_timestamp)*1000 as report_age FROM assets INNER JOIN gpsRecent 
	                   ON assets.cl_id = gpsRecent.client_id AND assets.iMEi = gpsRecent.asset_id AND
	                   gpsRecent.client_id=$owner AND gpsRecent.set_timestamp> $last_timestamp AND assets.device_mode <> 1	                   
					ORDER BY gpsRecent.set_timestamp DESC";
					
	if($_SESSION['SESS_ACCOUNT_TYPE'] == 'user'){
		$userId = $_SESSION['USR_USER_ID'];
		$queryDataGet="SELECT *, ($now - gpsRecent.set_timestamp)*1000 as report_age FROM groups INNER JOIN groups_assets 
								ON groups.id_group=groups_assets.group_id AND groups.client_num =$owner
							INNER JOIN assets 
								ON assets.ats_id = groups_assets.asset_id AND assets.cl_id=$owner 
							INNER JOIN user_group_perms 
								ON groups.id_group = user_group_perms.group_id AND groups.client_num = user_group_perms.client_id
								AND groups.client_num = $owner AND user_group_perms.user_id=$userId
							INNER JOIN gpsRecent 
	                   			ON assets.cl_id = gpsRecent.client_id AND assets.iMEi = gpsRecent.asset_id AND
	                   			gpsRecent.client_id=$owner AND gpsRecent.set_timestamp > $last_timestamp AND assets.device_mode<> 1	 
							GROUP BY assets.iMEi
							ORDER BY gpsRecent.set_timestamp DESC";
	}
					
	$resultDataGet = mysql_query($queryDataGet);
	
	$result = array();
	$status = array();

	$latest_timestamp=$last_timestamp;

	if($resultDataGet!=false){
		while($row=mysql_fetch_assoc($resultDataGet)){
			//	cast numeric values in $row from string type to numeric type
			//	otherwise they will be quoted strings in the JSON output.
			$row['gps_lat']=(float) $row['gps_lat'];
			$row['gps_lon']=(float) $row['gps_lon'];			
			$row['gps_alert']=(bool) $row['gps_alert'];
			if($row['gps_altitude']== null){
				$row['gps_altitude']= 'N/A';
			}
			$result[]=$row;
		}
	} else {
		array_push($status , array('error'=>'Failed to get assets!'));
		array_push($status , array('debug'=>'Failed to get assets!'));
	}

	echo json_encode(array("result" => $result, "status" => $status));
	exit();
?>
